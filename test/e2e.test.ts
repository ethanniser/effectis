import * as NodeSocketServer from "@effect/experimental/SocketServer/Node"
import { NodeContext } from "@effect/platform-node"
import { beforeEach, describe, expect, it } from "@effect/vitest"
import { Effect, FiberHandle, Layer, ManagedRuntime, pipe, Scope } from "effect"
import { main } from "../src/main.js"
import * as BasicStorage from "../src/Storage/BasicInMemory.js"

const rt = ManagedRuntime.make(Layer.empty)

const scope = rt.runSync(Scope.make())
const currenServerFiber = rt.runSync(FiberHandle.make().pipe(Scope.extend(scope)))

const startTestServer = pipe(
  Effect.log("Starting test server"),
  Effect.onInterrupt(() => Effect.log("Interrupted")),
  Effect.zipLeft(main),
  //   main,
  Effect.provide(BasicStorage.layer),
  Effect.provide(NodeSocketServer.layer({ port: 6379 })),
  Effect.provide(NodeContext.layer)
)

beforeEach(async () => {
  console.log("beforeEach")
  await pipe(
    Effect.log("hi"),
    Effect.zipLeft(FiberHandle.run(currenServerFiber, startTestServer)),
    rt.runPromise
  )
})

describe("e2e", () => {
  it.effect(
    "test",
    () =>
      Effect.gen(function*() {
        expect(true).toBe(true)
      })
  )
  it.effect(
    "test2",
    () =>
      Effect.gen(function*() {
        expect(true).toBe(true)
      })
  )
})
