import { describe, expect, it } from "@effect/vitest"
import { Chunk, Effect, pipe, Stream } from "effect"
import { processRESP } from "../src/main.js"
import { RESP } from "../src/RESP.js"
import * as BasicStorage from "../src/Storage/BasicInMemory.js"

const TestServices = BasicStorage.layer

const runInput = (input: RESP.Array) =>
  pipe(
    Stream.make(input),
    processRESP,
    Stream.runCollect
  )

describe("Storage", () => {
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
        const result = yield* runInput(input)
        expect(result).toEqual(Chunk.make(new RESP.SimpleString({ value: "OK" })))
      }).pipe(Effect.provide(TestServices))
  )
  it.effect(
    "SET and GET",
    () =>
      Effect.gen(function*() {
        const input1 = new RESP.Array({
          value: [
            new RESP.SimpleString({ value: "SET" }),
            new RESP.BulkString({ value: "key" }),
            new RESP.BulkString({ value: "value" })
          ]
        })
        yield* runInput(input1)

        const input2 = new RESP.Array({
          value: [
            new RESP.SimpleString({ value: "GET" }),
            new RESP.BulkString({ value: "key" })
          ]
        })
        const result = yield* runInput(input2)
        expect(result).toEqual(Chunk.make(new RESP.BulkString({ value: "value" })))
      }).pipe(Effect.provide(TestServices))
  )
})
