import { Effect, Match, ParseResult, pipe, Schema } from "effect"
import { RESP } from "./RESP.js"

// commands schould be serializable for WAL purposes
// some way to distinguish write vs read commands (only write commands should be replayed)

export namespace Commands {
  export class SET extends Schema.TaggedClass<SET>("SET")("SET", {
    key: Schema.String,
    value: Schema.String
  }) {
  }

  export class GET extends Schema.TaggedClass<GET>("GET")("GET", {
    key: Schema.String
  }) {}

  export class QUIT extends Schema.TaggedClass<QUIT>("QUIT")("QUIT", {}) {}
}

export const Command = Schema.Union(...Object.values(Commands))
export type Command = Schema.Schema.Type<typeof Command>

export const CommandFromRESP = pipe(
  Schema.compose(RESP.Value, RESP.Array),
  Schema.transformOrFail(Command, {
    decode: ({ value }, _, ast) =>
      Effect.gen(function*() {
        if (value === null || value.length === 0) {
          return yield* Effect.fail(new ParseResult.Type(ast, value, "Command expected at least one argument"))
        }

        return yield* Match.value(value[0].value).pipe(
          Match.when(
            "SET",
            () => Schema.decodeUnknown(Commands.SET)({ key: value[1].value, value: value[2].value })
          ),
          Match.when(
            "GET",
            () => Schema.decodeUnknown(Commands.GET)({ key: value[1].value })
          ),
          Match.when(
            "QUIT",
            () => Effect.succeed(new Commands.QUIT())
          ),
          Match.orElse(() => Effect.fail(new ParseResult.Type(ast, value[0].value, "Unknown command first argument")))
        ).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
      }),
    encode: (command) =>
      Effect.gen(function*() {
        const values = Match.value(command).pipe(
          Match.when(
            { _tag: "SET" },
            (
              command
            ) => [
              new RESP.BulkString({ value: command._tag }),
              new RESP.BulkString({ value: command.key }),
              new RESP.BulkString({ value: command.value })
            ]
          ),
          Match.when(
            { _tag: "GET" },
            (
              command
            ) => [
              new RESP.BulkString({ value: command._tag }),
              new RESP.BulkString({ value: command.key })
            ]
          ),
          Match.when(
            { _tag: "QUIT" },
            () => [new RESP.BulkString({ value: command._tag })]
          ),
          Match.exhaustive
        )

        return new RESP.Array({ value: values })
      })
  })
)
