#!/usr/bin/env node

import * as NodeSocketServer from "@effect/experimental/SocketServer/Node"
import * as NodeContext from "@effect/platform-node/NodeContext"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Effect from "effect/Effect"
import { run } from "./Cli.js"
import * as STMBackedInMemory from "./Storage/STMBackedInMemory.js"

run(process.argv).pipe(
  Effect.provide(STMBackedInMemory.layer),
  Effect.provide(NodeSocketServer.layer({ port: 6379 })),
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain()
)
