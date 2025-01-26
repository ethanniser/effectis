import { Schema } from "effect"
import { RESP } from "./RESP.js"

// commands schould be serializable for WAL purposes
// some way to distinguish write vs read commands (only write commands should be replayed)

export namespace Commands {
  export class Set extends Schema.TaggedClass<Set>("Set")("Set", {
    key: Schema.String,
    value: Schema.String
  }) {}

  export class Get extends Schema.TaggedClass<Get>("Get")("Get", {
    key: Schema.String
  }) {}
}

export const Command = Schema.Union(Commands.Set, Commands.Get)
export type Command = Schema.Schema.Type<typeof Command>

export const CommandFromRESP = Schema.transform(RESP.Value, Command, {
  decode: () => {
    throw new Error("Not implemented")
  },
  encode: () => {
    throw new Error("Not implemented")
  }
})
