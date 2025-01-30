import { NodeContext } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { generateCommandDocResponse } from "../src/Command.js"
import { RESP } from "../src/RESP.js"

const testServices = NodeContext.layer

describe("Command", () => {
  it.effect("command doc response", () =>
    Effect.gen(function*() {
      const result = yield* generateCommandDocResponse
      console.log(JSON.stringify(result, null, 2))
      const index = result.value.findIndex((value) => value.value === "GET")
      const doc = result.value[index + 1]
      expect(doc).toEqual(
        new RESP.Array({
          value: [
            new RESP.BulkString({ value: "summary" }),
            new RESP.BulkString({ value: "Returns the string value of a key." }),
            new RESP.BulkString({ value: "since" }),
            new RESP.BulkString({ value: "1.0.0" }),
            new RESP.BulkString({ value: "group" }),
            new RESP.BulkString({ value: "string" }),
            new RESP.BulkString({ value: "complexity" }),
            new RESP.BulkString({ value: "O(1)" }),
            new RESP.BulkString({ value: "arguments" }),
            new RESP.Array({
              value: [
                new RESP.Array({
                  value: [
                    new RESP.BulkString({ value: "name" }),
                    new RESP.BulkString({ value: "key" }),
                    new RESP.BulkString({ value: "type" }),
                    new RESP.BulkString({ value: "key" }),
                    new RESP.BulkString({ value: "display_text" }),
                    new RESP.BulkString({ value: "key" }),
                    new RESP.BulkString({ value: "key_spec_index" }),
                    new RESP.Integer({ value: 0 })
                  ]
                })
              ]
            })
          ]
        })
      )
    })
      .pipe(Effect.provide(testServices)))
})
