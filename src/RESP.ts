import { Effect, Match, ParseResult, Schema } from "effect"

export namespace RESP {
  export class SimpleString extends Schema.TaggedClass<SimpleString>("SimpleString")("SimpleString", {
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

  export class Error extends Schema.TaggedClass<Error>("Error")("Error", {
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

  export class Integer extends Schema.TaggedClass<Integer>("Integer")("Integer", {
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

  export class BulkString extends Schema.TaggedClass<BulkString>("BulkString")("BulkString", {
    value: Schema.NullOr(Schema.String)
  }) {
    static readonly WireFormat = Schema.String.pipe(
      Schema.startsWith("$"),
      Schema.endsWith("\r\n"),
      Schema.transformOrFail(Schema.NullOr(Schema.String), {
        decode: (s, _, ast) =>
          Effect.gen(function*() {
            const lengthOfLength = s.indexOf("\r\n") - 1
            const rawLen = s.slice(1, lengthOfLength + 1)

            if (rawLen === undefined) {
              return yield* Effect.fail(new ParseResult.Type(ast, s, "Expected bulk string to have length"))
            }

            const len = parseInt(rawLen)

            if (len === -1) {
              return null
            } else if (len < 0) {
              yield* Effect.fail(new ParseResult.Type(ast, s, "Expected positive integer for length"))
            }

            if (Number.isNaN(len)) {
              yield* Effect.fail(new ParseResult.Type(ast, s, "Expected integer"))
            }

            const restOfString = s.slice(3 + lengthOfLength, -2)
            if (restOfString.length !== len) {
              yield* Effect.fail(new ParseResult.Type(ast, s, `Expected string to have length ${len}`))
            }

            return restOfString
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

  export class Array extends Schema.TaggedClass<Array>("Array")("Array", {
    value: Schema.NullOr(Schema.Array(Schema.suspend(() => Value)))
  }) {
    static readonly WireFormat = Schema.String.pipe(
      Schema.startsWith("*"),
      Schema.endsWith("\r\n"),
      Schema.transformOrFail(Schema.NullOr(Schema.Array(Schema.suspend(() => Value))), {
        decode: (s, _, ast) =>
          Effect.gen(function*() {
            const lengthOfLength = s.indexOf("\r\n") - 1
            const rawLen = s.slice(1, lengthOfLength + 1)
            if (rawLen === undefined) {
              return yield* Effect.fail(new ParseResult.Type(ast, s, "Expected array to have length"))
            }

            const len = parseInt(rawLen)
            if (Number.isNaN(len)) {
              yield* Effect.fail(new ParseResult.Type(ast, s, "Expected integer for length"))
            }
            if (len === 0) {
              return []
            } else if (len === -1) {
              return null
            } else if (len < 0) {
              yield* Effect.fail(new ParseResult.Type(ast, s, "Expected positive integer for length"))
            }

            const rawValues = s.slice(3 + lengthOfLength)

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
                  const lengthOfLength = s.indexOf("\r\n") - 1
                  const rawLen = s.slice(1, lengthOfLength + 1)
                  const length = parseInt(rawLen)
                  const rest = s.slice(3 + lengthOfLength)

                  const values: globalThis.Array<string> = []
                  let remainder = rest
                  while (remainder.length > 0 && values.length < length) {
                    const result = getNextValue(remainder)
                    if (result === null) {
                      throw new globalThis.Error("Expected array to have length")
                    }
                    const [value, nextRemainder] = result

                    remainder = nextRemainder
                    values.push(value)
                  }
                  const arrLength = values.map((s) => s.length).reduce((a, b) => a + b, 0) + lengthOfLength + 2 // the *_ length
                  return arrLength
                }),
                Match.when("$", () => s.slice(3 + lengthOfLength).indexOf("\r\n") + 5),
                Match.when(":", () => s.indexOf("\r\n") + 1),
                Match.when("+", () => s.indexOf("\r\n") + 1),
                Match.when("-", () => s.indexOf("\r\n") + 1),
                Match.orElseAbsurd // this is a lie
              )

              return [s.slice(0, nextValueLength + 1), s.slice(nextValueLength + 1)] as const
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

            if (values.length !== len) {
              yield* Effect.fail(new ParseResult.Type(ast, s, `Expected array to have length ${len}`))
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
              return "*-1\r\n"
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

  export const Value = Schema.Union(
    SimpleString,
    Error,
    Integer,
    BulkString,
    ArraySuspended
  )

  export const ValueWireFormat: Schema.Schema<typeof Value.Type, string> = Schema.Union(
    SimpleString.WireFormat,
    Error.WireFormat,
    Integer.WireFormat,
    BulkString.WireFormat,
    Array.WireFormat
  )
}
