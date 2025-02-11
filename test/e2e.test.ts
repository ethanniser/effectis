import * as NodeSocketServer from "@effect/experimental/SocketServer/Node"
import { NodeContext } from "@effect/platform-node"
import { beforeAll, expect, layer } from "@effect/vitest"
import type { Duration } from "effect"
import { Clock, Deferred, Effect, Layer, Logger, LogLevel, pipe, Random } from "effect"
import * as Redis from "../src/client/index.js"
import { main } from "../src/main.js"
import * as STMBackedInMemory from "../src/Storage/STMBackedInMemory.js"

const mainLive = pipe(
  main,
  Effect.provide(Logger.minimumLogLevel(LogLevel.All)),
  Effect.forkScoped,
  Layer.scopedDiscard
)

const sharedServices = pipe(
  mainLive,
  Layer.provideMerge(
    Layer.mergeAll(
      STMBackedInMemory.layer(),
      NodeSocketServer.layer({ port: 6379 }),
      NodeContext.layer
    )
  ),
  // by default the logger is removed from the test context
  Layer.provide(Logger.pretty)
)

const generateKey = Random.nextInt.pipe(Effect.map((i) => `redisTests:${i}`))

const RUN_AGAINST_REAL_REDIS = true
const redisServerLive = RUN_AGAINST_REAL_REDIS ? Layer.empty : sharedServices

const redisClientLive = Redis.layer({ socket: { port: 6379, host: "localhost" } })

beforeAll(async () => {
  await Effect.runPromise(
    Effect.gen(function*() {
      const client = yield* Redis.Redis
      yield* client.use((client) => client.flushAll())
    }).pipe(Effect.provide(redisClientLive))
  )
})

const sleep = (duration: Duration.DurationInput) =>
  Effect.gen(function*() {
    const deferred = yield* Deferred.make<void, void>()

    yield* pipe(
      Deferred.succeed(deferred, void 0),
      Effect.delay(duration),
      Effect.withClock(Clock.make()),
      Effect.fork
    )

    return yield* Deferred.await(deferred)
  })

// * replace `sharedServices` with `Layer.empty` to run tests against a real redis server
// todo: need to override test services becuase no `it.live`
layer(Layer.mergeAll(redisServerLive, redisClientLive), {})(
  "e2e",
  (it) => {
    it.effect("basic SET and GET", () =>
      Effect.gen(function*() {
        const client = yield* Redis.Redis
        const key = yield* generateKey
        const results = yield* client.use((client) => client.multi().set(key, "value").get(key).exec())
        expect(results[1]).toEqual("value")
      }))

    it.effect("SET with EX", () =>
      Effect.gen(function*() {
        const client = yield* Redis.Redis
        const key = yield* generateKey
        const results = yield* client.use((client) =>
          client.multi()
            .set(key, "value", { PX: 100 })
            .get(key)
            .exec()
        )
        expect(results[1]).toEqual("value")
        yield* sleep("100 millis")
        const results2 = yield* client.use((client) => client.get(key))
        expect(results2).toEqual(null)
      }))

    it.effect("SET with NX (only if not exists)", () =>
      Effect.gen(function*() {
        const client = yield* Redis.Redis
        const key = yield* generateKey
        const results = yield* client.use((client) =>
          client.multi()
            .set(key, "value1")
            .set(key, "value2", { NX: true })
            .get(key)
            .exec()
        )
        expect(results[2]).toEqual("value1")
      }))

    it.effect("SET with XX (only if exists)", () =>
      Effect.gen(function*() {
        const client = yield* Redis.Redis
        const key = yield* generateKey
        const results = yield* client.use((client) =>
          client.multi()
            .set(key, "value1", { XX: true })
            .set(key, "value2")
            .set(key, "value3", { XX: true })
            .get(key)
            .exec()
        )
        expect(results[3]).toEqual("value3")
      }))

    it.effect("DEL", () =>
      Effect.gen(function*() {
        const client = yield* Redis.Redis
        const [key1, key2] = yield* Effect.all([generateKey, generateKey])
        const results = yield* client.use((client) =>
          client.multi()
            .set(key1, "value")
            .set(key2, "value2")
            .del([key1, key2])
            .get(key1)
            .exec()
        )
        expect(results[3]).toEqual(null)
      }))

    it.effect("EXISTS", () =>
      Effect.gen(function*() {
        const client = yield* Redis.Redis
        const [key1, key2] = yield* Effect.all([generateKey, generateKey])
        const results = yield* client.use((client) =>
          client.multi()
            .set(key1, "value")
            .set(key2, "value2")
            .exists([key1, key2])
            .exec()
        )
        expect(results[2]).toEqual(2)
      }))

    it.effect("TYPE", () =>
      Effect.gen(function*() {
        const client = yield* Redis.Redis
        const key = yield* generateKey
        const results = yield* client.use((client) =>
          client.multi()
            .set(key, "value")
            .type(key)
            .exec()
        )
        expect(results[1]).toEqual("string")
      }))
  }
)
