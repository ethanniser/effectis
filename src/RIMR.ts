// RIMR: Redis In-Memory Representation

import { Schema } from "effect"
import { RESP } from "./RESP.js"

export namespace RIMR {
  export class String extends Schema.TaggedClass<String>("String")("String", {
    value: Schema.String
  }) {}

  //   export class List extends Schema.TaggedClass<List>("List")("List", {
  //     value: Schema.Array(Schema.String)
  //   }) {}

  //   export class Set extends Schema.TaggedClass<Set>("Set")("Set", {
  //     value: Schema.SetFromSelf(Schema.String)
  //   }) {}

  export const Value = Schema.Union(String)
  export type Value = Schema.Schema.Type<typeof Value>

  export const RIMRToRESP = Schema.transform(RESP.Value, Value, {
    encode: () => {
      throw new Error("Not implemented")
    },
    decode: () => {
      throw new Error("Not implemented")
    }
  })
}
