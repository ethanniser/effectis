import * as NodeSocketServer from "@effect/experimental/SocketServer/Node"
import { NodeContext } from "@effect/platform-node"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Logger, pipe } from "effect"
import { createClient } from "redis"
import { main } from "../src/main.js"
import * as BasicStorage from "../src/Storage/BasicInMemory.js"

const mainLive = Layer.scopedDiscard(Effect.forkScoped(main))

const sharedServices = pipe(
  mainLive,
  Layer.provideMerge(
    Layer.mergeAll(
      BasicStorage.layer,
      NodeSocketServer.layer({ port: 0 }),
      NodeContext.layer
    )
  ),
  // by default the logger is removed from the test context
  Layer.provide(Logger.replace(Logger.defaultLogger, Logger.prettyLoggerDefault))
)

layer(sharedServices)("e2e", (it) => {
  it.effect("test 1", () =>
    Effect.gen(function*() {
      const client = yield* Effect.tryPromise(() => createClient().connect())
      expect(true).toBe(true)
    }))
})
