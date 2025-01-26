import { describe, expect, it } from "@effect/vitest"
import { Chunk, Effect, pipe, Stream } from "effect"
import { processRESP } from "../src/main.js"
import { RESP } from "../src/RESP.js"
import * as BasicStorage from "../src/Storage/BasicInMemory.js"

const TestServices = BasicStorage.layer

describe("Basic Storage", () => {
  it.effect(
    "SET",
    () =>
      Effect.gen(function*() {
        const input = new RESP.Array({
          value: [
            new RESP.SimpleString({ value: "SET" }),
            new RESP.BulkString({ value: "key" }),
            new RESP.BulkString({ value: "value" })
          ]
        })
        const result = yield* pipe(
          Stream.make(input),
          processRESP,
          Stream.runCollect
        )
        expect(result).toEqual(Chunk.make(new RESP.SimpleString({ value: "OK" })))
      }).pipe(Effect.provide(TestServices))
  )
})
