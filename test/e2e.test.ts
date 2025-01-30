import * as NodeSocketServer from "@effect/experimental/SocketServer/Node"
import { NodeContext } from "@effect/platform-node"
import { expect, layer } from "@effect/vitest"
import { Effect, Layer, Logger, LogLevel, pipe } from "effect"
import * as Redis from "../src/client/index.js"
import { main } from "../src/main.js"
import * as BasicStorage from "../src/Storage/BasicInMemory.js"

const mainLive = Layer.scopedDiscard(Effect.forkScoped(main.pipe(Effect.provide(Logger.minimumLogLevel(LogLevel.All)))))

const sharedServices = pipe(
  mainLive,
  Layer.provideMerge(
    Layer.mergeAll(
      BasicStorage.layer,
      NodeSocketServer.layer({ port: 6379 }),
      NodeContext.layer
    )
  ),
  // by default the logger is removed from the test context
  Layer.provide(Logger.pretty)
)

const clientFromServerAddress = Layer.unwrapEffect(
  Effect.gen(function*() {
    const server = yield* NodeSocketServer.SocketServer
    if (server.address._tag === "TcpAddress") {
      return Redis.layer({ socket: { port: server.address.port, host: server.address.hostname } })
    } else {
      return yield* Effect.die("Expected a tcp address")
    }
  })
)

layer(sharedServices)("e2e", (it) => {
  it.effect("basic SET and GET", () =>
    Effect.gen(function*() {
      const client = yield* Redis.Redis
      yield* client.use((client) => client.set("key", "value"))
      const result = yield* client.use((client) => client.get("key"))
      expect(result).toEqual("value")
    }).pipe(Effect.provide(clientFromServerAddress)))
})
