import type { Effect } from "effect"
import { Context, Schema } from "effect"
import type { Command } from "./Command.js"
import type { RESP } from "./RESP.js"

// add combinators to add log and flush persistence (with seperate persistence layer)

export class StorageError extends Schema.TaggedError<StorageError>("StorageError")("StorageError", {
  message: Schema.String
}) {}

export interface StorageImpl {
  run(command: Command): Effect.Effect<RESP.Value, StorageError, never>
}

export class Storage extends Context.Tag("Storage")<Storage, StorageImpl>() {}
