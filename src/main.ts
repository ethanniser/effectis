import * as SocketServer from "@effect/experimental/SocketServer";
import type { FileSystem } from "@effect/platform";
import { Socket } from "@effect/platform";
import {
  Channel,
  Effect,
  Either,
  identity,
  Match,
  Option,
  pipe,
  Schema,
  Scope,
  Stream,
} from "effect";
import { type Command, CommandFromRESP, CommandTypes } from "./Command.js";
import { RESP } from "./RESP.js";
import { Storage } from "./Storage.js";
import * as Tx from "./Transaction.js";
import { PubSubDriver } from "./PubSub.js";

type RedisEffectError = unknown;
type RedisServices = Storage | FileSystem.FileSystem;

const defaultNonErrorUnknownResponse = new RESP.SimpleString({
  value: "Unknown command",
});

export const main = Effect.gen(function* () {
  const server = yield* SocketServer.SocketServer;
  yield* Effect.logInfo(
    `Server started on port: ${
      server.address._tag === "TcpAddress" ? server.address.port : "unknown"
    }`
  );
  yield* server.run(handleConnection);
}).pipe(
  Effect.catchAll((e) => Effect.logError("Uncaught error", e)),
  Effect.catchAllDefect((e) => Effect.logFatal("Defect", e))
);

// can use fiberrefs for connection local state
const handleConnection = Effect.fn("handleConnection")(
  function* (socket: Socket.Socket) {
    yield* Effect.logInfo("New connection");
    const channel = Socket.toChannel<never>(socket);

    const rawInputStream = Stream.never.pipe(
      Stream.pipeThroughChannel(channel)
    );
    const rawOutputSink = Channel.toSink(channel);

    yield* pipe(
      rawInputStream,
      decodeFromWireFormat,
      Stream.tap((value) => Effect.logTrace("Received RESP: ", value)),
      processRESP,
      Stream.tap((value) => Effect.logTrace("Sending RESP: ", value)),
      encodeToWireFormat,
      Stream.run(rawOutputSink)
    );
  },
  Effect.onExit(() => Effect.logInfo("Connection closed")),
  Effect.scoped
);

// * probably need to move the pubsub stuff up here with some sequencing function- maybe stream.flatten?
type State =
  | {
      isSubscribed: true;
      scope: Scope.CloseableScope;
    }
  | {
      isSubscribed: false;
      scope: undefined;
    };

export const processRESP = (
  input: Stream.Stream<RESP.Value, RedisEffectError, RedisServices>
): Stream.Stream<RESP.Value, RedisEffectError, RedisServices> =>
  pipe(
    input,
    parseCommands,
    Stream.tap((value) => Effect.logTrace("Parsed command: ", value)),
    Stream.mapAccumEffect(
      {
        isSubscribed: false,
        scope: undefined,
      } as State,
      (state, commandOption) =>
        Effect.gen(function* () {
          if (Option.isNone(commandOption)) {
            return [
              state,
              Stream.make(new RESP.Error({ value: "Unknown command" })),
            ] as const;
          }
          const command = commandOption.value;

          if (state.isSubscribed) {
            if (Schema.is(CommandTypes.PubSub)(command)) {
              const [newState, result] = yield* handlePubSubCommand(
                command,
                state
              );
              return [newState, Option.some(result)];
            } else {
              return [state, Option.none()];
            }
          }

          if (Schema.is(CommandTypes.PubSub)(command)) {
            return yield* handlePubSubCommand(command, state);
          } else if (Schema.is(CommandTypes.Execution)(command)) {
            const result = handleExecutionCommand(command);
            return [state, Option.some(result)];
          } else if (Schema.is(CommandTypes.Server)(command)) {
            const result = handleServerCommand(command);
            return [state, Option.some(result)];
          } else {
            const result = handleStorageCommand(command);
            return [state, Option.some(result)];
          }
        })
    ),
    Stream.filter(Option.isSome),
    Stream.map((_) => _.value),
    Stream.flatten({ concurrency: 2 })
  ) as any;

const handlePubSubCommand = (
  command: CommandTypes.PubSub,
  state: State
): Effect.Effect<
  [State, Stream.Stream<RESP.Value, RedisEffectError, RedisServices>],
  RedisEffectError,
  RedisServices
> =>
  Effect.gen(function* () {
    const pubSub = yield* PubSubDriver;
    switch (command._tag) {
      case "SUBSCRIBE": {
        if (state.isSubscribed) {
          return [
            state,
            Stream.make(new RESP.Error({ value: "Already subscribed" })),
          ];
        } else {
        }
      }
    }
  }) as any;

const decodeFromWireFormat = (
  input: Stream.Stream<Uint8Array, Socket.SocketError, RedisServices>
): Stream.Stream<RESP.Value, RedisEffectError, RedisServices> =>
  pipe(
    input,
    Stream.decodeText(),
    Stream.flattenIterables, // basically turn into stream of individual characters (because our parser kinda sucks idk probably slow but works)
    Stream.mapAccumEffect("", (buffer, nextChunk) =>
      Effect.gen(function* () {
        const newBuffer = buffer + nextChunk;
        const parseResult = yield* Schema.decode(RESP.ValueWireFormat)(
          newBuffer
        ).pipe(Effect.either);
        if (Either.isRight(parseResult)) {
          return ["", Option.some(parseResult.right)];
        } else {
          return [newBuffer, Option.none()];
        }
      })
    ),
    Stream.filterMap(identity)
  );

const parseCommands = (
  input: Stream.Stream<RESP.Value, RedisEffectError, RedisServices>
): Stream.Stream<Option.Option<Command>, RedisEffectError, RedisServices> =>
  pipe(
    input,
    Stream.mapEffect((value) =>
      Schema.decode(CommandFromRESP)(value).pipe(
        Effect.tapError((e) => Effect.logError("Error parsing command", e)),
        Effect.either,
        Effect.map(Either.getRight)
      )
    )
  );

const handleStorageCommand = (
  input: CommandTypes.Storage
): Stream.Stream<RESP.Value, RedisEffectError, RedisServices> =>
  Effect.gen(function* () {
    if (yield* Tx.isRunningTransaction) {
      yield* Tx.appendToCurrentTransaction(input);
      return new RESP.SimpleString({ value: "QUEUED" });
    } else {
      const storage = yield* Storage;
      const result = yield* storage.run(input);
      return result;
    }
  });

const handleExecutionCommand = (
  input: CommandTypes.Execution
): Stream.Stream<RESP.Value, RedisEffectError, RedisServices> =>
  Effect.gen(function* () {
    switch (input._tag) {
      case "MULTI": {
        yield* Tx.startTransaction;
        return new RESP.SimpleString({ value: "OK" });
      }
      case "EXEC": {
        const results = yield* Tx.executeCurrentTransaction;
        return new RESP.Array({ value: results });
      }
      case "DISCARD": {
        yield* Tx.abortCurrentTransaction;
        return new RESP.SimpleString({ value: "OK" });
      }
      case "WATCH": {
        return defaultNonErrorUnknownResponse;
      }
      case "UNWATCH": {
        return defaultNonErrorUnknownResponse;
      }
      default: {
        return defaultNonErrorUnknownResponse;
      }
    }
  });

const handleServerCommand = (
  input: CommandTypes.Server
): Stream.Stream<RESP.Value, RedisEffectError, RedisServices> =>
  Effect.gen(function* () {
    return yield* Match.value(input).pipe(
      Match.when({ _tag: "QUIT" }, () =>
        Effect.succeed(new RESP.SimpleString({ value: "OK" }))
      ), // ! this is wrong
      // Match.when({ _tag: "COMMAND" }, (input) => {
      //   console.log("here", input)
      //   if (input.args[0]?.value === "DOCS") {
      //     return generateCommandDocResponse
      //   } else {
      //     return Effect.succeed(defaultNonErrorUnknownResponse)
      //   }
      // }),
      Match.orElse(() => Effect.succeed(defaultNonErrorUnknownResponse))
    );
  });

const encodeToWireFormat = (
  input: Stream.Stream<RESP.Value, RedisEffectError, RedisServices>
): Stream.Stream<Uint8Array, RedisEffectError, RedisServices> =>
  pipe(
    input,
    Stream.mapEffect((respValue) =>
      Schema.encode(RESP.ValueWireFormat)(respValue)
    ),
    Stream.encodeText
  );
