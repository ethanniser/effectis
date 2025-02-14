import * as NodeSocketServer from "@effect/experimental/SocketServer/Node";
import { NodeContext } from "@effect/platform-node";
import { beforeAll, expect, layer } from "@effect/vitest";
import type { Duration } from "effect";
import {
  Clock,
  Deferred,
  Effect,
  Layer,
  Logger,
  LogLevel,
  pipe,
  Queue,
  Random,
  Runtime,
} from "effect";
import * as Redis from "../src/client/index.js";
import { main } from "../src/main.js";
import * as STMBackedInMemory from "../src/Storage/STMBackedInMemory.js";

const mainLive = pipe(
  main,
  Effect.provide(Logger.minimumLogLevel(LogLevel.All)),
  Effect.forkScoped,
  Layer.scopedDiscard
);

const sharedServices = pipe(
  mainLive,
  Layer.provideMerge(
    Layer.mergeAll(
      STMBackedInMemory.layer(),
      NodeSocketServer.layer({ port: 6379 }),
      NodeContext.layer
    )
  )
  // Layer.provide(Layer.succeedContext(DefaultServices.liveServices))
  // by default the logger is removed from the test context
  // Layer.provide(Logger.pretty)
);

// todo: hack for now
// Effect.runPromise(Layer.launch(sharedServices));

const generateKey = Random.nextInt.pipe(Effect.map((i) => `redisTests:${i}`));

const RUN_AGAINST_REAL_REDIS = true;
const redisServerLive = RUN_AGAINST_REAL_REDIS ? Layer.empty : sharedServices;

const redisClientLive = Redis.layer({
  socket: { port: 6379, host: "localhost" },
});

beforeAll(async () => {
  // todo: if add persistence to our implementation, we can remove this
  await Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      yield* client.use((client) => client.flushAll());
    }).pipe(Effect.provide(redisClientLive))
  );
});

const sleep = (duration: Duration.DurationInput) =>
  Effect.gen(function* () {
    const deferred = yield* Deferred.make<void, void>();

    yield* pipe(
      Deferred.succeed(deferred, void 0),
      Effect.delay(duration),
      Effect.withClock(Clock.make()),
      Effect.fork
    );

    return yield* Deferred.await(deferred);
  });

// * replace `sharedServices` with `Layer.empty` to run tests against a real redis server
// todo: need to override test services becuase no `it.live`
layer(Layer.mergeAll(redisServerLive, redisClientLive), {})("e2e", (it) => {
  it.effect("basic SET and GET", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const key = yield* generateKey;
      yield* client.use((client) => client.set(key, "value"));
      const result = yield* client.use((client) => client.get(key));
      expect(result).toEqual("value");
    })
  );

  it.effect("SET with EX", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const key = yield* generateKey;
      yield* client.use((client) => client.set(key, "value", { PX: 100 }));
      const result = yield* client.use((client) => client.get(key));
      expect(result).toEqual("value");
      yield* sleep("110 millis");
      const result2 = yield* client.use((client) => client.get(key));
      expect(result2).toEqual(null);
    })
  );

  it.effect("SET with NX (only if not exists)", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const key = yield* generateKey;
      yield* client.use((client) => client.set(key, "value1"));
      yield* client.use((client) => client.set(key, "value2", { NX: true }));
      const result = yield* client.use((client) => client.get(key));
      expect(result).toEqual("value1");
    })
  );

  it.effect("SET with XX (only if exists)", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const key = yield* generateKey;
      yield* client.use((client) => client.set(key, "value1", { XX: true }));
      yield* client.use((client) => client.set(key, "value2"));
      yield* client.use((client) => client.set(key, "value3", { XX: true }));
      const result = yield* client.use((client) => client.get(key));
      expect(result).toEqual("value3");
    })
  );

  it.effect("DEL", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const [key1, key2] = yield* Effect.all([generateKey, generateKey]);
      yield* client.use((client) => client.set(key1, "value"));
      yield* client.use((client) => client.set(key2, "value2"));
      yield* client.use((client) => client.del([key1, key2]));
      const result = yield* client.use((client) => client.get(key1));
      expect(result).toEqual(null);
    })
  );

  it.effect("EXISTS", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const [key1, key2] = yield* Effect.all([generateKey, generateKey]);
      yield* client.use((client) => client.set(key1, "value"));
      yield* client.use((client) => client.set(key2, "value2"));
      const result = yield* client.use((client) => client.exists([key1, key2]));
      expect(result).toEqual(2);
    })
  );

  it.effect("TYPE", () =>
    Effect.gen(function* () {
      const client = yield* Redis.Redis;
      const key = yield* generateKey;
      yield* client.use((client) => client.set(key, "value"));
      const result = yield* client.use((client) => client.type(key));
      expect(result).toEqual("string");
    })
  );

  it.effect("MULTI", () =>
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
    })
  );

  it.effect("PUB SUB", () =>
    Effect.gen(function* () {
      const channel1Messages = yield* Queue.unbounded<string>();
      const channel2Messages = yield* Queue.unbounded<string>();

      const latch1 = yield* Effect.makeLatch();
      const latch2 = yield* Effect.makeLatch();
      const latch3 = yield* Effect.makeLatch();
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
          yield* latch1.await;
          yield* client.use((client) => client.unsubscribe("one"));
          yield* latch2.open;
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
          yield* client.use((client) => client.publish("one", "message1"));
          yield* client.use((client) => client.publish("two", "message2"));
          yield* latch1.open;
          yield* latch2.await;
          yield* client.use((client) => client.publish("one", "message3"));
          yield* client.use((client) => client.publish("two", "message4"));
          yield* latch3.open;
        }),
        Effect.provide(
          Layer.fresh(
            Redis.layer({ socket: { port: 6379, host: "localhost" } })
          )
        ),
        Effect.fork
      );

      yield* latch1.await;
      expect(yield* channel1Messages.take).toEqual("message1");
      expect(yield* channel2Messages.take).toEqual("message2");
      yield* latch3.await;
      expect(yield* channel1Messages.isEmpty).toEqual(true);
      expect(yield* channel2Messages.take).toEqual("message4");
    })
  );
});
