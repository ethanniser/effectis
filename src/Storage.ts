import { Context, Effect, Layer, Option, Schema } from "effect"
import type { Command } from "./Command.js"
import { RIMR } from "./RIMR.js"

export class StorageError extends Schema.TaggedError<StorageError>("StorageError")("StorageError", {
  message: Schema.String
}) {}

export interface StorageImpl {
  run(command: Command): Effect.Effect<RIMR.Value, StorageError, never>
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
              hm.set(command.key.value, command.value.value)
              return Option.some(new RIMR.String({ value: "OK" }))
            }
            case "Get": {
              const value = hm.get(command.key.value)
              if (value === undefined) {
                return new RIMR.String({ value: null })
              } else {
                return new RIMR.String({ value })
              }
            }
          }
        })
    }
  })
)
