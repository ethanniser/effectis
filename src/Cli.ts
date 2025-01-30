import { Options } from "@effect/cli"
import * as Command from "@effect/cli/Command"
import { Logger, LogLevel, pipe, Schema } from "effect"
import { main } from "./main.js"

const logLevelSchema: Schema.Schema<LogLevel.Literal> = Schema.Literal(...LogLevel.allLevels.map((level) => level._tag))

const logLevel = Options.text("logLevel").pipe(
  Options.withSchema(logLevelSchema),
  Options.withDefault("Info")
)

const command = Command.make(
  "redis-effect",
  { logLevel },
  ({ logLevel }) => pipe(main, Logger.withMinimumLogLevel(LogLevel.fromLiteral(logLevel)))
)

export const run = Command.run(command, {
  name: "redis-effect",
  version: "0.0.0"
})
