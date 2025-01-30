import { FileSystem } from "@effect/platform"
import { Effect, Match, ParseResult, pipe, Schema } from "effect"
import { RESP } from "./RESP.js"

// commands schould be serializable for WAL purposes
// some way to distinguish write vs read commands (only write commands should be replayed)

export namespace CommandTypes {
  // commands related to storage
  // (set, get, del, exists, type, etc.)
  export namespace StorageCommands {
    // commands that only read data (do not need to be included in the WAL)
    export namespace PureCommands {
      export class GET extends Schema.TaggedClass<GET>("GET")("GET", {
        key: Schema.String
      }) {}
    }
    export const Pure = Schema.Union(...Object.values(PureCommands))
    export type Pure = Schema.Schema.Type<typeof Pure>

    // commands that modify data (must be included in the WAL)
    export namespace EffectfulCommands {
      export class SET extends Schema.TaggedClass<SET>("SET")("SET", {
        key: Schema.String,
        value: Schema.String
      }) {}
    }
    export const Effectful = Schema.Union(...Object.values(EffectfulCommands))
    export type Effectful = Schema.Schema.Type<typeof Effectful>
  }

  export const Storage = Schema.Union(
    ...Object.values(StorageCommands.PureCommands),
    ...Object.values(StorageCommands.EffectfulCommands)
  )
  export type Storage = Schema.Schema.Type<typeof Storage>

  // commands that modify how commands are executed
  // (multi, exec, watch, discard, etc.)
  export namespace ExecutionCommands {}
  // export const Execution = Schema.Union(...Object.values(ExecutionCommands))
  // export type Execution = Schema.Schema.Type<typeof Execution>

  // commands that configure and modify the server
  // (client, config, info, etc.)
  export namespace ServerCommands {
    export class QUIT extends Schema.TaggedClass<QUIT>("QUIT")("QUIT", {}) {}
    export class CLIENT extends Schema.TaggedClass<CLIENT>("CLIENT")("CLIENT", {
      args: Schema.Array(RESP.Value)
    }) {}
    export class COMMAND extends Schema.TaggedClass<COMMAND>("COMMAND")("COMMAND", {
      args: Schema.Array(RESP.Value)
    }) {}
  }
  export const Server = Schema.Union(...Object.values(ServerCommands))
  export type Server = Schema.Schema.Type<typeof Server>

  // Commands that facilitate real-time communication but don’t store data
  // (publish, subscribe, etc.)
  export namespace MessagingCommands {}
  // export const Messaging = Schema.Union(...Object.values(MessagingCommands))
  // export type Messaging = Schema.Schema.Type<typeof Messaging>
}

const Commands = {
  ...CommandTypes.StorageCommands.EffectfulCommands,
  ...CommandTypes.StorageCommands.PureCommands,
  // ...CommandTypes.Execution,
  ...CommandTypes.ServerCommands
  // ...CommandTypes.Messaging
} as const

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

const supportedCommands = Object.keys(Commands)
const returnedKeys = ["summary", "since", "group", "complexity", "arguments"]

export const generateCommandDocResponse = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const json = yield* fs.readFileString("external/commands.json")
  const commands = JSON.parse(json)
  const filteredCommands = Object.fromEntries(
    Object.entries(commands).filter(([command]) => supportedCommands.includes(command)).map(
      ([command, commandData]) => {
        const filteredData = Object.fromEntries(
          Object.entries(commandData as object).filter(([key]) => returnedKeys.includes(key))
        )
        return [command, filteredData]
      }
    )
  )

  return toRESP(filteredCommands)
})

function toRESP(value: object): RESP.Value {
  if (Array.isArray(value)) {
    return new RESP.Array({
      value: value.map(toRESP)
    })
  } else if (typeof value === "object" && value !== null) {
    return new RESP.Array({
      value: Object.entries(value).flatMap(([key, value]) => [
        new RESP.BulkString({ value: key }),
        toRESP(value)
      ])
    })
  } else if (typeof value === "number") {
    return new RESP.Integer({ value })
  } else if (typeof value === "boolean") {
    return new RESP.SimpleString({ value: value ? "true" : "false" })
  } else if (value === null) {
    return new RESP.BulkString({ value: null })
  } else {
    return new RESP.BulkString({ value: String(value) })
  }
}
