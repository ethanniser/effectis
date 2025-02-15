import { Array, DateTime, Duration, Effect, Layer } from "effect";
import * as Redis from "../src/client/index.js";
import { NodeRuntime } from "@effect/platform-node";

const redisClientLive = Redis.layer({
  socket: { port: 6379, host: "localhost" },
});

const batchSize = 10;
const batches = 1;

const bench = (base: number) =>
  Effect.gen(function* () {
    const start = yield* DateTime.now;
    const client = yield* Redis.Redis;
    let i = base;
    let ops = 0;

    while (i < base + batchSize) {
      if (i % 25 === 0) {
        yield* client.use((client) =>
          client.set(`key:${i}`, "value", { PX: 25 })
        );
      }
      yield* client.use((client) => client.get(`key:${i}`));
      i++;
      ops++;
    }

    const end = yield* DateTime.now;
    const duration = DateTime.distanceDuration(start, end);
    return { ops, duration };
  }).pipe(Effect.provide(Layer.fresh(redisClientLive)));

const main = Effect.gen(function* () {
  const bases = Array.makeBy(batches, (n) => n * batchSize);
  const results = yield* Effect.all(bases.map(bench), { concurrency: 10 });

  // Aggregate total ops and time
  const totalOps = results.reduce((sum, r) => sum + r.ops, 0);
  const totalDurationMs = results.reduce(
    (sum, r) => sum + Duration.toMillis(r.duration),
    0
  );

  const rps = totalOps / (totalDurationMs / 1000); // Requests per second
  console.log(
    `Total Ops: ${totalOps}, Time: ${totalDurationMs}ms, RPS: ${rps}`
  );
});

NodeRuntime.runMain(main);
