import * as SocketServer from "@effect/experimental/SocketServer";
import type { FileSystem } from "@effect/platform";
import { Socket } from "@effect/platform";
import {
  Channel,
  Effect,
  Either,
  FiberRef,
  HashSet,
  identity,
  Match,
  Option,
  pipe,
  Schema,
  Scope,
  Stream,
  Exit,
} from "effect";
import { type Command, CommandFromRESP, CommandTypes } from "./Command.js";
import { RESP } from "./RESP.js";
import { Storage } from "./Storage.js";
import * as Tx from "./Transaction.js";
import {
  currentlySubscribedChannelsFiberRef,
  PubSubDriver,
  PubSubMessage,
} from "./PubSub.js";

type RedisEffectError = unknown;
type RedisServices = Storage | FileSystem.FileSystem | PubSubDriver;

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
      handleAccumEffect
    ),
    Stream.filter(Option.isSome),
    Stream.map((_) => _.value),
    Stream.flatten({ concurrency: 2 })
  );

const handleAccumEffect = (
  state: State,
  commandOption: Option.Option<Command>
): Effect.Effect<
  readonly [
    State,
    Option.Option<Stream.Stream<RESP.Value, RedisEffectError, RedisServices>>
  ],
  RedisEffectError,
  RedisServices
> =>
  Effect.gen(function* () {
    if (Option.isNone(commandOption)) {
      return [
        state,
        Option.some(Stream.make(new RESP.Error({ value: "Unknown command" }))),
      ] as const;
    }
    const command = commandOption.value;

    if (state.isSubscribed) {
      if (Schema.is(CommandTypes.PubSub)(command)) {
        return yield* handlePubSubCommand(command, state);
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
    throw new Error("Not implemented");
  });

const handlePubSubCommand = (
  command: CommandTypes.PubSub,
  state: State
): Effect.Effect<
  readonly [
    State,
    Option.Option<Stream.Stream<RESP.Value, RedisEffectError, RedisServices>>
  ],
  RedisEffectError,
  RedisServices
> =>
  Effect.gen(function* () {
    const pubSub = yield* PubSubDriver;
    switch (command._tag) {
      case "SUBSCRIBE": {
        if (state.isSubscribed) {
          return [state, Option.none()] as const;
        } else {
          yield* FiberRef.set(
            currentlySubscribedChannelsFiberRef,
            HashSet.make(...command.channels)
          );

          const scope = yield* Scope.make();
          const subscription = yield* pubSub
            .subscribe(command.channels)
            .pipe(Scope.extend(scope));

          const messageStream = subscription.pipe(
            Stream.map(
              ({ channel, message }) =>
                new RESP.Array({
                  value: [
                    new RESP.BulkString({ value: "message" }),
                    new RESP.BulkString({ value: channel }),
                    new RESP.BulkString({ value: message }),
                  ],
                })
            )
          );

          return [
            {
              isSubscribed: true,
              scope,
            },
            Option.some(
              Stream.concat(
                Stream.make(
                  new RESP.Array({
                    value: [
                      new RESP.BulkString({ value: "subscribe" }),
                      ...command.channels.map(
                        (channel) => new RESP.BulkString({ value: channel })
                      ),
                      new RESP.Integer({ value: command.channels.length }),
                    ],
                  })
                ),
                messageStream
              )
            ),
          ] as const;
        }
      }
      case "UNSUBSCRIBE": {
        if (!state.isSubscribed) {
          return [
            state,
            Option.some(
              Stream.make(
                new RESP.Error({
                  value: "Tried to unsubscribe but was not subscribed",
                })
              )
            ),
          ] as const;
        } else {
          const currentlySubscribedChannels = yield* FiberRef.updateAndGet(
            currentlySubscribedChannelsFiberRef,
            HashSet.filter((channel) => !command.channels.includes(channel))
          );

          // if no longer subscribed to any channels, close the scope (interupting the subscription stream)
          if (HashSet.size(currentlySubscribedChannels) === 0) {
            yield* Scope.close(state.scope, Exit.void);
          }

          return [
            {
              isSubscribed: false,
              scope: undefined,
            },
            Option.some(
              Stream.make(
                new RESP.Array({
                  value: [
                    new RESP.BulkString({ value: "unsubscribe" }),
                    ...command.channels.map(
                      (channel) => new RESP.BulkString({ value: channel })
                    ),
                    new RESP.Integer({ value: command.channels.length }),
                  ],
                })
              )
            ),
          ] as const;
        }
      }
      case "PUBLISH": {
        if (state.isSubscribed) {
          return [state, Option.none()] as const;
        } else {
          yield* pubSub.publish.offer(new PubSubMessage(command));
          return [
            state,
            Option.some(
              Stream.make(
                new RESP.Integer({
                  value: yield* pubSub.nSubscribers(command.channel),
                })
              )
            ),
          ] as const;
        }
      }
    }
  });

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
