import type { Effect } from "effect"
import { Context, Layer, Ref, Schema, TMap } from "effect"
import type { Command } from "./Command.js"

class StoredString extends Schema.TaggedClass<StoredString>("StoredString")("StoredString", {
  value: Schema.String
}) {}

const StoredValue = Schema.Union(StoredString)
type StoredValue = Schema.Schema.Type<typeof StoredValue>

export interface StorageImpl {
  run(command: Command): Effect.Effect<StoredValue, never>
}

class Storage extends Context.Tag("Storage")<Storage, StorageImpl>() {}
