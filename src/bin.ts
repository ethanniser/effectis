#!/usr/bin/env node

import { run } from "./Cli.js";
import { Effect } from "effect";
import { NodeContext, NodeRuntime } from "@effect/platform-node";

run(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
