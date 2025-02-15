#!/usr/bin/env node

import * as NodeSocketServer from "@effect/experimental/SocketServer/Node";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import { run } from "./Cli.js";
import * as STMBackedInMemory from "./Storage/STMBackedInMemory.js";
import { Layer } from "effect";
import * as PubSub from "./PubSub.js";

const AllServices = Layer.mergeAll(
  STMBackedInMemory.layer(),
  NodeSocketServer.layer({ port: 6379 }),
  NodeContext.layer,
  PubSub.layer
);

run(process.argv).pipe(Effect.provide(AllServices), NodeRuntime.runMain);
