import type { Effect } from "effect"
import { Context } from "effect"
import type { Command } from "./Command.js"
import type { RIMR } from "./RIMR.js"

export interface StorageImpl {
  run(command: Command): Effect.Effect<RIMR.Value, never>
}

export class Storage extends Context.Tag("Storage")<Storage, StorageImpl>() {}
