import * as NodeSocketServer from "@effect/experimental/SocketServer/Node";
import { NodeContext } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Logger, LogLevel, pipe, Queue, Random } from "effect";
import * as Redis from "../src/client/index.js";
import { main } from "../src/main.js";
import * as STMBackedInMemory from "../src/Storage/STMBackedInMemory.js";
import * as PubSub from "../src/PubSub.js";

const mainLive = pipe(
  main,
  Effect.provide(Logger.minimumLogLevel(LogLevel.None)), // change this for debugging
  Effect.forkScoped,
  Layer.scopedDiscard
);

const sharedServices = pipe(
  mainLive,
  Layer.provideMerge(
    Layer.mergeAll(
      STMBackedInMemory.layer(),
      NodeSocketServer.layer({ port: 6379 }),
      NodeContext.layer,
      PubSub.layer
    )
  )
);

// todo: hack for now- runs server, comment to run against real redis
Effect.runPromise(Layer.launch(sharedServices));

const generateKey = Random.nextInt.pipe(Effect.map((i) => `redisTests:${i}`));

const redisClientLive = Redis.layer({
  socket: { port: 6379, host: "localhost" },
}).pipe(Layer.fresh);

describe("e2e", () => {
  it.live("basic SET and GET", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const key = yield* generateKey;
      expect(key).toBeTruthy();
      yield* client.use((client) => client.set(key, "value"));
      const result = yield* client.use((client) => client.get(key));
      expect(result).toEqual("value");
    }).pipe(Effect.provide(redisClientLive))
  );

  it.live("SET with EX", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const key = yield* generateKey;
      yield* client.use((client) => client.set(key, "value", { PX: 100 }));
      const result = yield* client.use((client) => client.get(key));
      expect(result).toEqual("value");
      yield* Effect.sleep("110 millis");
      const result2 = yield* client.use((client) => client.get(key));
      expect(result2).toEqual(null);
    }).pipe(Effect.provide(redisClientLive))
  );

  it.live("SET with NX (only if not exists)", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const key = yield* generateKey;
      yield* client.use((client) => client.set(key, "value1"));
      yield* client.use((client) => client.set(key, "value2", { NX: true }));
      const result = yield* client.use((client) => client.get(key));
      expect(result).toEqual("value1");
    }).pipe(Effect.provide(redisClientLive))
  );

  it.live("SET with XX (only if exists)", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const key = yield* generateKey;
      yield* client.use((client) => client.set(key, "value1", { XX: true }));
      yield* client.use((client) => client.set(key, "value2"));
      yield* client.use((client) => client.set(key, "value3", { XX: true }));
      const result = yield* client.use((client) => client.get(key));
      expect(result).toEqual("value3");
    }).pipe(Effect.provide(redisClientLive))
  );

  it.live("DEL", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const [key1, key2] = yield* Effect.all([generateKey, generateKey]);
      yield* client.use((client) => client.set(key1, "value"));
      yield* client.use((client) => client.set(key2, "value2"));
      yield* client.use((client) => client.del([key1, key2]));
      const result = yield* client.use((client) => client.get(key1));
      expect(result).toEqual(null);
    }).pipe(Effect.provide(redisClientLive))
  );

  it.live("EXISTS", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const [key1, key2] = yield* Effect.all([generateKey, generateKey]);
      yield* client.use((client) => client.set(key1, "value"));
      yield* client.use((client) => client.set(key2, "value2"));
      const result = yield* client.use((client) => client.exists([key1, key2]));
      expect(result).toEqual(2);
    }).pipe(Effect.provide(redisClientLive))
  );

  it.live("TYPE", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const key = yield* generateKey;
      yield* client.use((client) => client.set(key, "value"));
      const result = yield* client.use((client) => client.type(key));
      expect(result).toEqual("string");
    }).pipe(Effect.provide(redisClientLive))
  );

  it.live("MULTI", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const [key1, key2] = yield* Effect.all([generateKey, generateKey]);
      const results = yield* client.use((client) =>
        client
          .multi()
          .set(key1, "value")
          .set(key2, "value2")
          .get(key1)
          .get(key2)
          .exec()
      );
      expect(results).toEqual(["OK", "OK", "value", "value2"]);
    }).pipe(Effect.provide(redisClientLive))
  );

  it.live("PUB SUB", () =>
    Effect.gen(function* () {
      const channel1Messages = yield* Queue.unbounded<string>();
      const channel2Messages = yield* Queue.unbounded<string>();

      const subscriptionOpen = yield* Effect.makeLatch();
      const firstSendDone = yield* Effect.makeLatch();
      const firstUnsubscribeDone = yield* Effect.makeLatch();
      const secondSendDone = yield* Effect.makeLatch();
      const allDone = yield* Effect.makeLatch();
      yield* pipe(
        Effect.gen(function* () {
          const client = yield* Redis.Redis;

          // subscribe to 2 channels
          yield* client.use((client) =>
            client.subscribe(["one", "two"], (message, channel) => {
              if (channel === "one") {
                channel1Messages.unsafeOffer(message);
              } else if (channel === "two") {
                channel2Messages.unsafeOffer(message);
              }
            })
          );
          yield* subscriptionOpen.open;
          yield* firstSendDone.await;
          yield* client.use((client) => client.unsubscribe("one"));
          yield* firstUnsubscribeDone.open;
          yield* allDone.await;
        }),
        Effect.provide(
          Layer.fresh(
            Redis.layer({ socket: { port: 6379, host: "localhost" } })
          )
        ),
        Effect.fork
      );

      yield* pipe(
        Effect.gen(function* () {
          const client = yield* Redis.Redis;

          // publish to both channels
          yield* subscriptionOpen.await;
          yield* client.use((client) => client.publish("one", "message1"));
          yield* client.use((client) => client.publish("two", "message2"));
          yield* firstSendDone.open;
          yield* firstUnsubscribeDone.await;
          yield* client.use((client) => client.publish("one", "message3"));
          yield* client.use((client) => client.publish("two", "message4"));
          yield* secondSendDone.open;
        }),
        Effect.provide(
          Layer.fresh(
            Redis.layer({ socket: { port: 6379, host: "localhost" } })
          )
        ),
        Effect.fork
      );

      yield* firstSendDone.await;
      expect(yield* channel1Messages.take).toEqual("message1");
      expect(yield* channel2Messages.take).toEqual("message2");
      yield* secondSendDone.await;
      expect(yield* channel2Messages.take).toEqual("message4");
      expect(yield* channel1Messages.isEmpty).toEqual(true); // we do this check after the second to make sure the first message could have been received (if the unsubscribe didn't happen)
      yield* allDone.open;
    })
  );
});
