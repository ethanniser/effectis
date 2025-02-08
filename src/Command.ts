import { Effect, Match, ParseResult, pipe, Schema } from "effect"
import { RESP } from "./RESP.js"

// commands schould be serializable for WAL purposes
// some way to distinguish write vs read commands (only write commands should be replayed)

export namespace Commands {
  // commands related to storage
  // (set, get, del, exists, type, etc.)

  // Basic Commands
  export class SET extends Schema.TaggedClass<SET>("SET")("SET", {
    key: Schema.String,
    value: Schema.String,
    expiration: Schema.optional(Schema.DurationFromSelf),
    mode: Schema.optional(Schema.Literal("NX", "XX"))
  }) {}

  export class GET extends Schema.TaggedClass<GET>("GET")("GET", {
    key: Schema.String
  }) {}

  export class DEL extends Schema.TaggedClass<DEL>("DEL")("DEL", {
    keys: Schema.Array(Schema.String)
  }) {}

  export class EXISTS extends Schema.TaggedClass<EXISTS>("EXISTS")("EXISTS", {
    keys: Schema.Array(Schema.String)
  }) {}

  export class EXPIRE extends Schema.TaggedClass<EXPIRE>("EXPIRE")("EXPIRE", {
    key: Schema.String,
    duration: Schema.DurationFromSelf,
    mode: Schema.optional(Schema.Literal("NX", "XX", "GT", "LT"))
  }) {}

  export class TTL extends Schema.TaggedClass<TTL>("TTL")("TTL", {
    key: Schema.String
  }) {}

  export class PERSIST extends Schema.TaggedClass<PERSIST>("PERSIST")("PERSIST", {
    key: Schema.String
  }) {}

  export class TYPE extends Schema.TaggedClass<TYPE>("TYPE")("TYPE", {
    key: Schema.String
  }) {}

  // String Commands

  export class APPEND extends Schema.TaggedClass<APPEND>("APPEND")("APPEND", {
    key: Schema.String,
    value: Schema.String
  }) {}

  export class INCR extends Schema.TaggedClass<INCR>("INCR")("INCR", {
    key: Schema.String
  }) {}

  export class DECR extends Schema.TaggedClass<DECR>("DECR")("DECR", {
    key: Schema.String
  }) {}

  export class INCRBY extends Schema.TaggedClass<INCRBY>("INCRBY")("INCRBY", {
    key: Schema.String,
    increment: Schema.Int
  }) {}

  export class DECRBY extends Schema.TaggedClass<DECRBY>("DECRBY")("DECRBY", {
    key: Schema.String,
    decrement: Schema.Int
  }) {}

  export class STRLEN extends Schema.TaggedClass<STRLEN>("STRLEN")("STRLEN", {
    key: Schema.String
  }) {}

  // List Commands
  export class LPUSH extends Schema.TaggedClass<LPUSH>("LPUSH")("LPUSH", {
    key: Schema.String,
    values: Schema.Array(Schema.String)
  }) {}

  export class RPUSH extends Schema.TaggedClass<RPUSH>("RPUSH")("RPUSH", {
    key: Schema.String,
    values: Schema.Array(Schema.String)
  }) {}

  export class LPOP extends Schema.TaggedClass<LPOP>("LPOP")("LPOP", {
    key: Schema.String,
    count: Schema.optional(Schema.Int)
  }) {}

  export class RPOP extends Schema.TaggedClass<RPOP>("RPOP")("RPOP", {
    key: Schema.String,
    count: Schema.optional(Schema.Int)
  }) {}

  export class LLEN extends Schema.TaggedClass<LLEN>("LLEN")("LLEN", {
    key: Schema.String
  }) {}

  export class LRANGE extends Schema.TaggedClass<LRANGE>("LRANGE")("LRANGE", {
    key: Schema.String,
    start: Schema.Int,
    stop: Schema.Int
  }) {}

  // commands that modify how commands are executed
  // (multi, exec, watch, discard, etc.)

  // commands that configure and modify the server
  // (client, config, info, etc.)
  export class QUIT extends Schema.TaggedClass<QUIT>("QUIT")("QUIT", {}) {}
  export class CLIENT extends Schema.TaggedClass<CLIENT>("CLIENT")("CLIENT", {
    args: Schema.Array(RESP.Value)
  }) {}
  export class COMMAND extends Schema.TaggedClass<COMMAND>("COMMAND")("COMMAND", {
    args: Schema.Array(RESP.Value)
  }) {}

  // Commands that facilitate real-time communication but don’t store data
  // (publish, subscribe, etc.)
}

export namespace CommandTypes {
  export type Storage =
    | Commands.GET
    | Commands.SET
    | Commands.DEL
    | Commands.EXISTS
    | Commands.EXPIRE
    | Commands.TTL
    | Commands.PERSIST
    | Commands.TYPE
    | Commands.APPEND
    | Commands.INCR
    | Commands.DECR
    | Commands.INCRBY
    | Commands.DECRBY
    | Commands.STRLEN
    | Commands.LPUSH
    | Commands.RPUSH
    | Commands.LPOP
    | Commands.RPOP
    | Commands.LLEN
    | Commands.LRANGE
  export const Storage = Schema.Union(
    Commands.GET,
    Commands.SET,
    Commands.DEL,
    Commands.EXISTS,
    Commands.EXPIRE,
    Commands.TTL,
    Commands.PERSIST,
    Commands.TYPE,
    Commands.APPEND,
    Commands.INCR,
    Commands.DECR,
    Commands.INCRBY,
    Commands.DECRBY,
    Commands.STRLEN,
    Commands.LPUSH,
    Commands.RPUSH,
    Commands.LPOP,
    Commands.RPOP,
    Commands.LLEN,
    Commands.LRANGE
  )
  export namespace StorageCommands {
    // commands that only read data (do not need to be included in the WAL)
    export type Pure =
      | Commands.GET
      | Commands.EXISTS
      | Commands.TTL
      | Commands.TYPE
      | Commands.STRLEN
      | Commands.LLEN
      | Commands.LRANGE
    export const Pure = Schema.Union(
      Commands.GET,
      Commands.EXISTS,
      Commands.TTL,
      Commands.TYPE,
      Commands.STRLEN,
      Commands.LLEN,
      Commands.LRANGE
    )
    // commands that modify data (must be included in the WAL)
    export type Effectful =
      | Commands.SET
      | Commands.DEL
      | Commands.EXPIRE
      | Commands.PERSIST
      | Commands.APPEND
      | Commands.INCR
      | Commands.DECR
      | Commands.INCRBY
      | Commands.DECRBY
      | Commands.LPUSH
      | Commands.RPUSH
      | Commands.LPOP
      | Commands.RPOP
    export const Effectful = Schema.Union(
      Commands.SET,
      Commands.DEL,
      Commands.EXPIRE,
      Commands.PERSIST,
      Commands.APPEND,
      Commands.INCR,
      Commands.DECR,
      Commands.INCRBY,
      Commands.DECRBY,
      Commands.LPUSH,
      Commands.RPUSH,
      Commands.LPOP,
      Commands.RPOP
    )
  }
  export type Server = Commands.QUIT | Commands.CLIENT | Commands.COMMAND
  export const Server = Schema.Union(Commands.QUIT, Commands.CLIENT, Commands.COMMAND)
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

        // I dont love this but we want the validation
        // if just use constructors type issues and throws idk
        return yield* Match.value(value[0].value).pipe(
          Match.when(
            "SET",
            () =>
              Schema.decodeUnknown(Commands.SET)({
                _tag: "SET",
                key: value[1].value,
                value: value[2].value
              })
          ),
          Match.when(
            "GET",
            () =>
              Schema.decodeUnknown(Commands.GET)({
                _tag: "GET",
                key: value[1].value
              })
          ),
          Match.when(
            "QUIT",
            () => Effect.succeed(new Commands.QUIT())
          ),
          Match.when(
            "CLIENT",
            () =>
              Schema.decodeUnknown(Commands.CLIENT)({
                _tag: "CLIENT",
                args: value.slice(1)
              })
          ),
          Match.when(
            "COMMAND",
            () =>
              Schema.decodeUnknown(Commands.COMMAND)({
                _tag: "COMMAND",
                args: value.slice(1)
              })
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
          Match.when(
            { _tag: "CLIENT" },
            (
              command
            ) => [
              new RESP.BulkString({ value: command._tag }),
              ...command.args
            ]
          ),
          Match.when(
            { _tag: "COMMAND" },
            (
              command
            ) => [
              new RESP.BulkString({ value: command._tag }),
              ...command.args
            ]
          ),
          Match.exhaustive
        )

        return new RESP.Array({ value: values })
      })
  })
)

// const supportedCommands = Object.keys(Commands)
// const returnedKeys = ["summary", "since", "group", "complexity", "arguments"]

// export const generateCommandDocResponse = Effect.gen(function*() {
//   const fs = yield* FileSystem.FileSystem
//   const json = yield* fs.readFileString("external/commands.json")
//   const commands = JSON.parse(json)
//   const filteredCommands = Object.fromEntries(
//     Object.entries(commands).filter(([command]) => supportedCommands.includes(command)).map(
//       ([command, commandData]) => {
//         const filteredData = Object.fromEntries(
//           Object.entries(commandData as object).filter(([key]) => returnedKeys.includes(key))
//         )
//         return [command, filteredData]
//       }
//     )
//   )

//   return toRESP(filteredCommands)
// })

// function toRESP(value: object): RESP.Value {
//   if (Array.isArray(value)) {
//     return new RESP.Array({
//       value: value.map(toRESP)
//     })
//   } else if (typeof value === "object" && value !== null) {
//     return new RESP.Array({
//       value: Object.entries(value).flatMap(([key, value]) => [
//         new RESP.BulkString({ value: key }),
//         toRESP(value)
//       ])
//     })
//   } else if (typeof value === "number") {
//     return new RESP.Integer({ value })
//   } else if (typeof value === "boolean") {
//     return new RESP.SimpleString({ value: value ? "true" : "false" })
//   } else if (value === null) {
//     return new RESP.BulkString({ value: null })
//   } else {
//     return new RESP.BulkString({ value: String(value) })
//   }
// }
