import { Effect, Match, ParseResult, Schema } from "effect"

export namespace RESP {
  class SimpleString extends Schema.TaggedClass<SimpleString>("SimpleString")("SimpleString", {
    value: Schema.String
  }) {
    static readonly WireFormat = Schema.String.pipe(
      Schema.startsWith("+"),
      Schema.endsWith("\r\n"),
      Schema.transform(Schema.String, {
        decode: (s) => s.slice(1, -2),
        encode: (s) => `+${s}\r\n`
      }),
      Schema.transform(SimpleString, {
        decode: (s) => new SimpleString({ value: s }),
        encode: (s) => s.value
      })
    )
  }

  class Error extends Schema.TaggedClass<Error>("Error")("Error", {
    value: Schema.String
  }) {
    static readonly WireFormat = Schema.String.pipe(
      Schema.startsWith("-"),
      Schema.endsWith("\r\n"),
      Schema.transform(Schema.String, {
        decode: (s) => s.slice(1, -2),
        encode: (s) => `-${s}\r\n`
      }),
      Schema.transform(Error, {
        decode: (s) => new Error({ value: s }),
        encode: (s) => s.value
      })
    )
  }

  class Integer extends Schema.TaggedClass<Integer>("Integer")("Integer", {
    value: Schema.Int
  }) {
    static readonly WireFormat = Schema.String.pipe(
      Schema.startsWith(":"),
      Schema.endsWith("\r\n"),
      Schema.transform(Schema.String, {
        decode: (s) => s.slice(1, -2),
        encode: (s) => `:${s}\r\n`
      }),
      Schema.transformOrFail(Schema.Int, {
        decode: (s, _, ast) =>
          Effect.gen(function*() {
            const n = parseInt(s)
            if (Number.isNaN(n)) {
              yield* Effect.fail(new ParseResult.Type(ast, s, "Expected integer"))
            }
            return n
          }),

        encode: (s) => Effect.succeed(s.toString())
      }),
      Schema.transform(Integer, {
        decode: (s) => new Integer({ value: s }),
        encode: (s) => s.value
      })
    )
  }

  class BulkString extends Schema.TaggedClass<BulkString>("BulkString")("BulkString", {
    value: Schema.NullOr(Schema.String)
  }) {
    static readonly WireFormat = Schema.String.pipe(
      Schema.startsWith("$"),
      Schema.endsWith("\r\n"),
      Schema.transformOrFail(Schema.NullOr(Schema.String), {
        decode: (s, _, ast) =>
          Effect.gen(function*() {
            const rawLen = s.at(1)
            if (rawLen === undefined) {
              return yield* Effect.fail(new ParseResult.Type(ast, s, "Expected bulk string to have length"))
            }
            const len = parseInt(rawLen)
            if (Number.isNaN(len)) {
              yield* Effect.fail(new ParseResult.Type(ast, s, "Expected integer"))
            }

            return len === -1 ? null : s.slice(2, 2 + len)
          }),
        encode: (s) => Effect.succeed(s === null ? "$-1\r\n" : `$${s.length}\r\n${s}\r\n`)
      }),
      Schema.transform(BulkString, {
        decode: (s) => new BulkString({ value: s }),
        encode: (s) => s.value
      })
    )
  }

  const ArraySuspended = Schema.suspend((): Schema.Schema<Array> => Array)

  class Array extends Schema.TaggedClass<Array>("Array")("Array", {
    value: Schema.NullOr(Schema.Array(Schema.suspend(() => Value)))
  }) {
    static readonly WireFormat = Schema.String.pipe(
      Schema.startsWith("*"),
      Schema.endsWith("\r\n"),
      Schema.transformOrFail(Schema.NullOr(Schema.Array(Schema.suspend(() => Value))), {
        decode: (s, _, ast) =>
          Effect.gen(function*() {
            const rawLen = s.at(1)
            if (rawLen === undefined) {
              return yield* Effect.fail(new ParseResult.Type(ast, s, "Expected array to have length"))
            }
            const len = parseInt(rawLen)
            if (Number.isNaN(len)) {
              yield* Effect.fail(new ParseResult.Type(ast, s, "Expected integer"))
            }

            if (len === -1) {
              return null
            }
            if (len === 0) {
              return []
            }

            const rawValues = s.slice(2)
            // calculate where to split the string to get the values
            // const valuesBeginIndexes = [0]

            const getNextValue = (
              s: string
            ): [next: string, remainder: string] | null => {
              const nextItemType = s.at(0)
              if (nextItemType === undefined) {
                return null
              }

              // todo: error handle number parsing
              const nextValueLength = Match.value(nextItemType).pipe(
                Match.when("*", () => {
                  const rest = s.slice(2)
                  const values: globalThis.Array<string> = []
                  let remainder = rest
                  while (remainder.length > 0) {
                    const result = getNextValue(remainder)
                    if (result === null) {
                      throw new globalThis.Error("Expected array to have length")
                    }
                    const [value, nextRemainder] = result
                    remainder = nextRemainder
                    values.push(value)
                  }
                  return values.map((s) => s.length).reduce((a, b) => a + b, 0)
                }),
                Match.when("$", () => parseInt(s.at(1)!) + 2 + 4),
                Match.when(":", () => parseInt(s.at(1)!) + 2 + 4),
                Match.when("+", () => s.indexOf("\r\n") + 2),
                Match.when("-", () => s.indexOf("\r\n") + 2),
                Match.orElseAbsurd // this is a lie
              )

              return [s.slice(1, nextValueLength + 1), s.slice(nextValueLength + 1)] as const
            }

            // ? could this be functional?
            const values: globalThis.Array<string> = []
            let remainder = rawValues
            while (remainder.length > 0) {
              const result = getNextValue(remainder)
              if (result === null) {
                throw new globalThis.Error("Expected array to have length")
              }
              const [value, nextRemainder] = result
              remainder = nextRemainder
              values.push(value)
            }
            const decodedValues = yield* Schema.decode(Schema.Array(Schema.suspend(() => ValueWireFormat)))(values)
              .pipe(
                Effect.catchTag(
                  "ParseError",
                  () => Effect.fail(new ParseResult.Forbidden(ast, values, "This should never happen"))
                )
              )
            return decodedValues
          }),
        encode: (arr, _, ast) =>
          Effect.gen(function*() {
            if (arr === null) {
              return "-1\r\n"
            }
            const encodedValues = yield* Schema.encode(Schema.Array(Schema.suspend(() => ValueWireFormat)))(arr).pipe(
              Effect.catchTag("ParseError", () =>
                Effect.fail(new ParseResult.Forbidden(ast, arr, "This should never happen")))
            )
            return `*${encodedValues.length}\r\n${encodedValues.join("")}`
          })
      }),
      Schema.transform(Array, {
        decode: (s) => new Array({ value: s }),
        encode: (s) => s.value
      })
    )
  }

  const Value = Schema.Union(
    SimpleString,
    Error,
    Integer,
    BulkString,
    ArraySuspended
  )

  const ValueWireFormat: Schema.Schema<typeof Value.Type, string> = Schema.Union(
    SimpleString.WireFormat,
    Error.WireFormat,
    Integer.WireFormat,
    BulkString.WireFormat,
    Array.WireFormat
  )
}
