import { Effect, Layer } from "effect"
import { RESP } from "../RESP.js"
import { Storage } from "../Storage.js"

export const layer = Layer.effect(
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
