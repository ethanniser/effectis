import { Duration, Effect, ParseResult, pipe, Schema } from "effect"
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
    increment: Schema.parseNumber(Schema.String)
  }) {}

  export class DECRBY extends Schema.TaggedClass<DECRBY>("DECRBY")("DECRBY", {
    key: Schema.String,
    decrement: Schema.parseNumber(Schema.String)
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
    count: Schema.optional(Schema.parseNumber(Schema.String))
  }) {}

  export class RPOP extends Schema.TaggedClass<RPOP>("RPOP")("RPOP", {
    key: Schema.String,
    count: Schema.optional(Schema.parseNumber(Schema.String))
  }) {}

  export class LLEN extends Schema.TaggedClass<LLEN>("LLEN")("LLEN", {
    key: Schema.String
  }) {}

  export class LRANGE extends Schema.TaggedClass<LRANGE>("LRANGE")("LRANGE", {
    key: Schema.String,
    start: Schema.parseNumber(Schema.String),
    stop: Schema.parseNumber(Schema.String)
  }) {}

  // Hash Commands

  export class HSET extends Schema.TaggedClass<HSET>("HSET")("HSET", {
    key: Schema.String,
    values: Schema.Array(Schema.Tuple(Schema.String, Schema.String))
  }) {}

  export class HGET extends Schema.TaggedClass<HGET>("HGET")("HGET", {
    key: Schema.String,
    field: Schema.String
  }) {}

  export class HDEL extends Schema.TaggedClass<HDEL>("HDEL")("HDEL", {
    key: Schema.String,
    fields: Schema.Array(Schema.String)
  }) {}

  export class HEXISTS extends Schema.TaggedClass<HEXISTS>("HEXISTS")("HEXISTS", {
    key: Schema.String,
    field: Schema.String
  }) {}

  export class HGETALL extends Schema.TaggedClass<HGETALL>("HGETALL")("HGETALL", {
    key: Schema.String
  }) {}

  // Set Commands

  export class SADD extends Schema.TaggedClass<SADD>("SADD")("SADD", {
    key: Schema.String,
    values: Schema.Array(Schema.String)
  }) {}

  export class SREM extends Schema.TaggedClass<SREM>("SREM")("SREM", {
    key: Schema.String,
    values: Schema.Array(Schema.String)
  }) {}

  export class SMEMBERS extends Schema.TaggedClass<SMEMBERS>("SMEMBERS")("SMEMBERS", {
    key: Schema.String
  }) {}

  export class SCARD extends Schema.TaggedClass<SCARD>("SCARD")("SCARD", {
    key: Schema.String
  }) {}

  export class SISMEMBER extends Schema.TaggedClass<SISMEMBER>("SISMEMBER")("SISMEMBER", {
    key: Schema.String,
    value: Schema.String
  }) {}

  // commands that modify how commands are executed
  // (multi, exec, watch, discard, etc.)

  export class MULTI extends Schema.TaggedClass<MULTI>("MULTI")("MULTI", {}) {}
  export class EXEC extends Schema.TaggedClass<EXEC>("EXEC")("EXEC", {}) {}
  export class DISCARD extends Schema.TaggedClass<DISCARD>("DISCARD")("DISCARD", {}) {}
  export class WATCH extends Schema.TaggedClass<WATCH>("WATCH")("WATCH", {
    keys: Schema.Array(Schema.String)
  }) {}
  export class UNWATCH extends Schema.TaggedClass<UNWATCH>("UNWATCH")("UNWATCH", {}) {}

  // commands that configure and modify the server
  // (client, config, info, etc.)
  export class QUIT extends Schema.TaggedClass<QUIT>("QUIT")("QUIT", {}) {}
  export class PING extends Schema.TaggedClass<PING>("PING")("PING", {
    message: Schema.optional(Schema.String)
  }) {}
  export class ECHO extends Schema.TaggedClass<ECHO>("ECHO")("ECHO", {
    message: Schema.String
  }) {}
  export class COMMAND extends Schema.TaggedClass<COMMAND>("COMMAND")("COMMAND", {
    args: Schema.Array(Schema.String)
  }) {}

  // Commands that facilitate real-time communication but don’t store data
  // (publish, subscribe, etc.)
  export class PUBLISH extends Schema.TaggedClass<PUBLISH>("PUBLISH")("PUBLISH", {
    channel: Schema.String,
    message: Schema.String
  }) {}
  export class SUBSCRIBE extends Schema.TaggedClass<SUBSCRIBE>("SUBSCRIBE")("SUBSCRIBE", {
    channels: Schema.Array(Schema.String)
  }) {}
  export class UNSUBSCRIBE extends Schema.TaggedClass<UNSUBSCRIBE>("UNSUBSCRIBE")("UNSUBSCRIBE", {
    channels: Schema.Array(Schema.String)
  }) {}
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
    | Commands.HSET
    | Commands.HGET
    | Commands.HDEL
    | Commands.HEXISTS
    | Commands.HGETALL
    | Commands.SADD
    | Commands.SREM
    | Commands.SMEMBERS
    | Commands.SCARD
    | Commands.SISMEMBER
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
    Commands.LRANGE,
    Commands.HSET,
    Commands.HGET,
    Commands.HDEL,
    Commands.HEXISTS,
    Commands.HGETALL,
    Commands.SADD,
    Commands.SREM,
    Commands.SMEMBERS,
    Commands.SCARD,
    Commands.SISMEMBER
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
      | Commands.HGET
      | Commands.HEXISTS
      | Commands.HGETALL
      | Commands.SMEMBERS
      | Commands.SCARD
      | Commands.SISMEMBER
    export const Pure = Schema.Union(
      Commands.GET,
      Commands.EXISTS,
      Commands.TTL,
      Commands.TYPE,
      Commands.STRLEN,
      Commands.LLEN,
      Commands.LRANGE,
      Commands.HGET,
      Commands.HEXISTS,
      Commands.HGETALL,
      Commands.SMEMBERS,
      Commands.SCARD,
      Commands.SISMEMBER
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
      | Commands.HSET
      | Commands.HDEL
      | Commands.SADD
      | Commands.SREM
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
      Commands.RPOP,
      Commands.HSET,
      Commands.HDEL,
      Commands.SADD,
      Commands.SREM
    )
  }
  export type Execution = Commands.MULTI | Commands.EXEC | Commands.DISCARD | Commands.WATCH | Commands.UNWATCH
  export const Execution = Schema.Union(
    Commands.MULTI,
    Commands.EXEC,
    Commands.DISCARD,
    Commands.WATCH,
    Commands.UNWATCH
  )
  export type Server =
    | Commands.QUIT
    | Commands.PING
    | Commands.ECHO
    | Commands.COMMAND
  export const Server = Schema.Union(
    Commands.QUIT,
    Commands.PING,
    Commands.ECHO,
    Commands.COMMAND
  )

  export type Messaging = Commands.PUBLISH | Commands.SUBSCRIBE | Commands.UNSUBSCRIBE
  export const Messaging = Schema.Union(Commands.PUBLISH, Commands.SUBSCRIBE, Commands.UNSUBSCRIBE)
}

export const Command = Schema.Union(...Object.values(Commands))
export type Command = Schema.Schema.Type<typeof Command>

const NonNullBulkString = Schema.transformOrFail(
  Schema.compose(RESP.Value, RESP.BulkString),
  Schema.String,
  {
    encode: (value) => Effect.succeed(new RESP.BulkString({ value })),
    decode: ({ value }, _, ast) =>
      Effect.gen(function*() {
        if (value === null) {
          return yield* Effect.fail(new ParseResult.Type(ast, value, "Expected non-null string"))
        }
        return yield* Effect.succeed(value)
      })
  }
)

function chunkPairs<T>(arr: Array<T>): Array<[T, T]> {
  return arr
    .map((_, i) => (i % 2 === 0 ? [arr[i], arr[i + 1]] as [T, T] : null))
    .filter((x): x is [T, T] => x !== null)
}

export const CommandFromRESP = pipe(
  Schema.compose(RESP.Value, RESP.Array),
  Schema.transformOrFail(Schema.typeSchema(Command), {
    decode: ({ value }, _, ast) =>
      Effect.gen(function*() {
        if (value === null) {
          return yield* Effect.fail(new ParseResult.Type(ast, value, "Expected non null array"))
        }
        const commandArgs = yield* Schema.decode(Schema.Array(NonNullBulkString))(value).pipe(
          Effect.catchTag("ParseError", (error) => Effect.fail(error.issue))
        )
        const command = commandArgs[0]
        const args = commandArgs.slice(1)

        switch (command) {
          case "SET":
            return yield* Schema.decode(Commands.SET)({
              _tag: "SET",
              key: args[0],
              value: args[1]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "GET":
            return yield* Schema.decode(Commands.GET)({
              _tag: "GET",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "DEL":
            return yield* Schema.decode(Commands.DEL)({
              _tag: "DEL",
              keys: args
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "EXISTS":
            return yield* Schema.decode(Commands.EXISTS)({
              _tag: "EXISTS",
              keys: args
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          // case "EXPIRE":
          //   return yield* Schema.decode(Commands.EXPIRE)({
          //     _tag: "EXPIRE",
          //     key: args[0],
          //     duration: args[1]
          //   }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "TTL":
            return yield* Schema.decode(Commands.TTL)({
              _tag: "TTL",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "PERSIST":
            return yield* Schema.decode(Commands.PERSIST)({
              _tag: "PERSIST",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "TYPE":
            return yield* Schema.decode(Commands.TYPE)({
              _tag: "TYPE",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "APPEND":
            return yield* Schema.decode(Commands.APPEND)({
              _tag: "APPEND",
              key: args[0],
              value: args[1]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "INCR":
            return yield* Schema.decode(Commands.INCR)({
              _tag: "INCR",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "DECR":
            return yield* Schema.decode(Commands.DECR)({
              _tag: "DECR",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "INCRBY":
            return yield* Schema.decode(Commands.INCRBY)({
              _tag: "INCRBY",
              key: args[0],
              increment: args[1]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "DECRBY":
            return yield* Schema.decode(Commands.DECRBY)({
              _tag: "DECRBY",
              key: args[0],
              decrement: args[1]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "STRLEN":
            return yield* Schema.decode(Commands.STRLEN)({
              _tag: "STRLEN",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "LPUSH":
            return yield* Schema.decode(Commands.LPUSH)({
              _tag: "LPUSH",
              key: args[0],
              values: args.slice(1)
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "RPUSH":
            return yield* Schema.decode(Commands.RPUSH)({
              _tag: "RPUSH",
              key: args[0],
              values: args.slice(1)
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "LPOP":
            return yield* Schema.decode(Commands.LPOP)({
              _tag: "LPOP",
              key: args[0],
              count: args[1]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "RPOP":
            return yield* Schema.decode(Commands.RPOP)({
              _tag: "RPOP",
              key: args[0],
              count: args[1]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "LLEN":
            return yield* Schema.decode(Commands.LLEN)({
              _tag: "LLEN",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "LRANGE":
            return yield* Schema.decode(Commands.LRANGE)({
              _tag: "LRANGE",
              key: args[0],
              start: args[1],
              stop: args[2]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "HSET":
            return yield* Schema.decode(Commands.HSET)({
              _tag: "HSET",
              key: args[0],
              values: chunkPairs(args.slice(1))
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "HGET":
            return yield* Schema.decode(Commands.HGET)({
              _tag: "HGET",
              key: args[0],
              field: args[1]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "HDEL":
            return yield* Schema.decode(Commands.HDEL)({
              _tag: "HDEL",
              key: args[0],
              fields: args.slice(1)
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "HEXISTS":
            return yield* Schema.decode(Commands.HEXISTS)({
              _tag: "HEXISTS",
              key: args[0],
              field: args[1]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "HGETALL":
            return yield* Schema.decode(Commands.HGETALL)({
              _tag: "HGETALL",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "SADD":
            return yield* Schema.decode(Commands.SADD)({
              _tag: "SADD",
              key: args[0],
              values: args.slice(1)
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "SREM":
            return yield* Schema.decode(Commands.SREM)({
              _tag: "SREM",
              key: args[0],
              values: args.slice(1)
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "SMEMBERS":
            return yield* Schema.decode(Commands.SMEMBERS)({
              _tag: "SMEMBERS",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "SCARD":
            return yield* Schema.decode(Commands.SCARD)({
              _tag: "SCARD",
              key: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "SISMEMBER":
            return yield* Schema.decode(Commands.SISMEMBER)({
              _tag: "SISMEMBER",
              key: args[0],
              value: args[1]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "MULTI":
            return yield* Effect.succeed(new Commands.MULTI())
          case "EXEC":
            return yield* Effect.succeed(new Commands.EXEC())
          case "DISCARD":
            return yield* Effect.succeed(new Commands.DISCARD())
          case "WATCH":
            return yield* Schema.decode(Commands.WATCH)({
              _tag: "WATCH",
              keys: args
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "UNWATCH":
            return yield* Effect.succeed(new Commands.UNWATCH())
          case "QUIT":
            return yield* Effect.succeed(new Commands.QUIT())
          case "PING":
            return yield* Schema.decode(Commands.PING)({
              _tag: "PING",
              message: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "ECHO":
            return yield* Schema.decode(Commands.ECHO)({
              _tag: "ECHO",
              message: args[0]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "COMMAND":
            return yield* Schema.decode(Commands.COMMAND)({
              _tag: "COMMAND",
              args
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "PUBLISH":
            return yield* Schema.decode(Commands.PUBLISH)({
              _tag: "PUBLISH",
              channel: args[0],
              message: args[1]
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "SUBSCRIBE":
            return yield* Schema.decode(Commands.SUBSCRIBE)({
              _tag: "SUBSCRIBE",
              channels: args
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          case "UNSUBSCRIBE":
            return yield* Schema.decode(Commands.UNSUBSCRIBE)({
              _tag: "UNSUBSCRIBE",
              channels: args
            }).pipe(Effect.catchTag("ParseError", (error) => Effect.fail(error.issue)))
          default:
            return yield* Effect.fail(new ParseResult.Type(ast, command, "Unknown command"))
        }
      }),
    encode: (command, _, ast) =>
      Effect.gen(function*() {
        switch (command._tag) {
          case "SET":
            return new RESP.Array({
              value: [
                new RESP.BulkString({ value: "SET" }),
                new RESP.BulkString({ value: command.key }),
                new RESP.BulkString({ value: command.value }),
                ...(command.expiration
                  ? [
                    new RESP.BulkString({ value: "EX" }),
                    new RESP.BulkString({ value: Duration.toSeconds(command.expiration).toString() })
                  ]
                  : []),
                ...(command.mode ? [new RESP.BulkString({ value: command.mode })] : [])
              ]
            })
          case "GET":
            return new RESP.Array({
              value: [
                new RESP.BulkString({ value: "GET" }),
                new RESP.BulkString({ value: command.key })
              ]
            })
          case "DEL":
            return new RESP.Array({
              value: [
                new RESP.BulkString({ value: "DEL" }),
                ...command.keys.map((key) => new RESP.BulkString({ value: key }))
              ]
            })
          case "EXISTS":
            return new RESP.Array({
              value: [
                new RESP.BulkString({ value: "EXISTS" }),
                ...command.keys.map((key) => new RESP.BulkString({ value: key }))
              ]
            })
          case "EXPIRE":
            return new RESP.Array({
              value: [
                new RESP.BulkString({ value: "EXPIRE" }),
                new RESP.BulkString({ value: command.key }),
                new RESP.BulkString({ value: Duration.toSeconds(command.duration).toString() }),
                ...(command.mode ? [new RESP.BulkString({ value: command.mode })] : [])
              ]
            })
          case "TTL":
            return new RESP.Array({
              value: [
                new RESP.BulkString({ value: "TTL" }),
                new RESP.BulkString({ value: command.key })
              ]
            })
          case "PERSIST":
            return new RESP.Array({
              value: [
                new RESP.BulkString({ value: "PERSIST" }),
                new RESP.BulkString({ value: command.key })
              ]
            })
          case "TYPE":
            return new RESP.Array({
              value: [
                new RESP.BulkString({ value: "TYPE" }),
                new RESP.BulkString({ value: command.key })
              ]
            })
          default:
            return yield* Effect.fail(
              new ParseResult.Forbidden(ast, command, `TODO: CANNOT ENCODE COMMAND: ${command._tag}`)
            )
        }
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
