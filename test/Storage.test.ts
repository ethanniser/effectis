import { describe, expect, it } from "@effect/vitest"
import { Chunk, Effect, pipe, Schema, Stream } from "effect"
import { CommandFromRESP, Commands } from "../src/Command.js"
import { processRESP } from "../src/main.js"
import { RESP } from "../src/RESP.js"
import * as BasicStorage from "../src/Storage/BasicInMemory.js"

const TestServices = BasicStorage.layer

const runInput = (input: RESP.Value) =>
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
        const input = yield* Schema.encode(CommandFromRESP)(new Commands.Set({ key: "key", value: "value" }))
        const result = yield* runInput(input)
        expect(result).toEqual(Chunk.make(new RESP.SimpleString({ value: "OK" })))
      }).pipe(Effect.provide(TestServices))
  )
  it.effect(
    "SET and GET",
    () =>
      Effect.gen(function*() {
        const input1 = yield* Schema.encode(CommandFromRESP)(new Commands.Set({ key: "key", value: "value" }))
        yield* runInput(input1)

        const input2 = yield* Schema.encode(CommandFromRESP)(new Commands.Get({ key: "key" }))
        const result = yield* runInput(input2)
        expect(result).toEqual(Chunk.make(new RESP.BulkString({ value: "value" })))
      }).pipe(Effect.provide(TestServices))
  )
})
