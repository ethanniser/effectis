import * as NodeSocketServer from "@effect/experimental/SocketServer/Node"
import { NodeContext } from "@effect/platform-node"
import { expect, it, layer } from "@effect/vitest"
import { Effect, Layer, Logger, pipe } from "effect"
import { createClient } from "redis"
import * as Redis from "../src/client/index.js"
import { main } from "../src/main.js"
import * as BasicStorage from "../src/Storage/BasicInMemory.js"

const mainLive = Layer.scopedDiscard(Effect.forkScoped(main))

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
  Layer.provide(Logger.replace(Logger.defaultLogger, Logger.prettyLoggerDefault))
)

const clientFromServerAddress = Layer.unwrapEffect(
  Effect.gen(function*() {
    const server = yield* NodeSocketServer.SocketServer
    if (server.address._tag === "TcpAddress") {
      yield* Effect.logInfo("Trying to connect to server on port:", server.address.port)
      return Redis.layer({ socket: { port: server.address.port } })
    } else {
      return yield* Effect.die("Expected a tcp address")
    }
  })
)

// layer(sharedServices)("e2e", (it) => {
//   it.effect.skip("test 1", () =>
//     Effect.gen(function*() {
//       const client = yield* Redis.Redis
//       yield* client.use((client) => client.set("key", "value"))
//       const result = yield* client.use((client) => client.get("key"))
//       expect(result).toEqual("value")
//     }).pipe(Effect.provide(clientFromServerAddress)))
// })
it("test 2", async () => {
  const client = await createClient().connect()
  await client.set("key", "value")
  const result = await client.get("key")
  expect(result).toEqual("value")
})
