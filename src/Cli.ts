import { Options } from "@effect/cli";
import * as Command from "@effect/cli/Command";
import { Config, Effect, Layer, Logger, LogLevel, pipe, Schema } from "effect";
import { main } from "./main.js";
import * as NodeSocketServer from "@effect/experimental/SocketServer/Node";
import * as STMBackedInMemory from "./Storage/STMBackedInMemory.js";
import * as PubSub from "./PubSub.js";

const logLevelSchema: Schema.Schema<LogLevel.Literal> = Schema.Literal(
  ...LogLevel.allLevels.map((level) => level._tag)
);

const logLevel = Options.text("logLevel").pipe(
  Options.withSchema(logLevelSchema),
  Options.withDefault("Info")
);

const port = Options.integer("port").pipe(
  Options.withDefault(6379),
  Options.withFallbackConfig(Config.integer("PORT"))
);

const command = Command.make(
  "effectis",
  { logLevel, port },
  ({ logLevel, port }) =>
    pipe(
      main,
      Logger.withMinimumLogLevel(LogLevel.fromLiteral(logLevel)),
      Effect.provide(
        Layer.mergeAll(
          NodeSocketServer.layer({ port }),
          STMBackedInMemory.layer(),
          PubSub.layer
        )
      )
    )
);

export const run = Command.run(command, {
  name: "effectis",
  version: "0.0.0",
});
