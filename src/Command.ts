import { Schema } from "effect"

// commands schould be serializable for WAL purposes
// some way to distinguish write vs read commands (only write commands should be replayed)

namespace Commands {
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
