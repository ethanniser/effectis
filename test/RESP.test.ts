import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { RESP } from "../src/RESP.js"

describe("RESP Parser", () => {
  it.effect(
    "should parse simple string",
    () =>
      Effect.gen(function*() {
        const input = "+OK\r\n"
        const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input)
        expect(parsed).toEqual(new RESP.SimpleString({ value: "OK" }))
      })
  )

  it.effect(
    "should parse error",
    () =>
      Effect.gen(function*() {
        const input = "-ERR\r\n"
        const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input)
        expect(parsed).toEqual(new RESP.Error({ value: "ERR" }))
      })
  )

  it.effect(
    "should parse integer",
    () =>
      Effect.gen(function*() {
        const input = ":1\r\n"
        const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input)
        expect(parsed).toEqual(new RESP.Integer({ value: 1 }))
      })
  )

  it.effect(
    "should parse bulk string",
    () =>
      Effect.gen(function*() {
        const input = "$5\r\nHello\r\n"
        const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input)
        expect(parsed).toEqual(new RESP.BulkString({ value: "Hello" }))
      })
  )

  it.effect(
    "should parse null bulk string",
    () =>
      Effect.gen(function*() {
        const input = "$-1\r\n"
        const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input)
        expect(parsed).toEqual(new RESP.BulkString({ value: null }))
      })
  )

  it.effect("should parse empty array", () =>
    Effect.gen(function*() {
      const input = "*0\r\n"
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input)
      expect(parsed).toEqual(new RESP.Array({ value: [] }))
    }))

  it.effect("should parse null array", () =>
    Effect.gen(function*() {
      const input = "*-1\r\n"
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input)
      expect(parsed).toEqual(new RESP.Array({ value: null }))
    }))
})
