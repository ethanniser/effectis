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

  it.effect("should parse just int array", () =>
    Effect.gen(function*() {
      const input = "*3\r\n:1\r\n:2\r\n:3\r\n"
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input)
      expect(parsed).toEqual(
        new RESP.Array({
          value: [new RESP.Integer({ value: 1 }), new RESP.Integer({ value: 2 }), new RESP.Integer({ value: 3 })]
        })
      )
    }))

  it.effect("should parse simple array", () =>
    Effect.gen(function*() {
      const input = "*4\r\n:1\r\n+OK\r\n-ERR\r\n$5\r\nHello\r\n"
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input)
      expect(parsed).toEqual(
        new RESP.Array({
          value: [
            new RESP.Integer({ value: 1 }),
            new RESP.SimpleString({ value: "OK" }),
            new RESP.Error({ value: "ERR" }),
            new RESP.BulkString({ value: "Hello" })
          ]
        })
      )
    }))

  it.effect("should parse nested array", () =>
    Effect.gen(function*() {
      const input = "*3\r\n*2\r\n:1\r\n:2\r\n*2\r\n:3\r\n:4\r\n+HI\r\n"
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input)
      expect(parsed).toEqual(
        new RESP.Array({
          value: [
            new RESP.Array({ value: [new RESP.Integer({ value: 1 }), new RESP.Integer({ value: 2 })] }),
            new RESP.Array({ value: [new RESP.Integer({ value: 3 }), new RESP.Integer({ value: 4 })] }),
            new RESP.SimpleString({ value: "HI" })
          ]
        })
      )
    }))

  // todo: add tests for strings and arrays with multi digit and negative lengths
})
