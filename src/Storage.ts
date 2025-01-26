import { Context, Effect, Layer, Schema } from "effect"
import type { Command } from "./Command.js"
import { RESP } from "./RESP.js"

export class StorageError extends Schema.TaggedError<StorageError>("StorageError")("StorageError", {
  message: Schema.String
}) {}

export interface StorageImpl {
  run(command: Command): Effect.Effect<RESP.Value, StorageError, never>
}

export class Storage extends Context.Tag("Storage")<Storage, StorageImpl>() {}

export const BasicLive = Layer.effect(
  Storage,
  Effect.gen(function*() {
    const hm = new Map<string, string>()
    yield* Effect.void
    return {
      run: (command) =>
        Effect.gen(function*() {
          yield* Effect.void
          switch (command._tag) {
            case "Set": {
              hm.set(command.key, command.value)
              return new RESP.SimpleString({ value: "OK" })
            }
            case "Get": {
              const value = hm.get(command.key)
              if (value === undefined) {
                return new RESP.BulkString({ value: null })
              } else {
                return new RESP.BulkString({ value })
              }
            }
          }
        })
    }
  })
)
