// @ts-nocheck

//
import {
  Data,
  DateTime,
  Duration,
  Effect,
  HashSet,
  Layer,
  Option,
  Schedule,
  Stream,
} from "effect";
import * as SocketServer from "@effect/experimental/SocketServer";
import { Socket } from "@effect/platform";
import * as NodeSocketServer from "@effect/experimental/SocketServer/Node";

export const main = Effect.gen(function* () {
  const server = yield* SocketServer.SocketServer;
  yield* Effect.logInfo(`Server started on port: ${server.address.port}`);
  yield* server.run(handleConnection);
});

declare const handleConnection: (socket: Socket.Socket) => Effect.Effect<void>;

main.pipe(Effect.provide(NodeSocketServer.layer({ port: 6379 })));
main.pipe(Effect.provide(NodeSocketServer.layerWebSocket({ port: 1234 })));

//

const handleConnection = (socket: Socket.Socket) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("New connection");
    const channel = Socket.toChannel<never>(socket);

    const rawInputStream = Stream.never.pipe(
      Stream.pipeThroughChannel(channel)
    );
    const rawOutputSink = Channel.toSink(channel);

    yield* rawInputStream.pipe(processStream, Stream.run(rawOutputSink));
  }).pipe(Effect.onExit(() => Effect.logInfo("Connection closed")));

const processStream = identity;

//

declare function decodeFromWireFormat(
  input: Stream<Uint8Array>
): Stream<RESP.Value>;

declare function parseToCommands(input: Stream<RESP.Value>): Stream<Command>;

declare function handleCommand(input: Stream<Command>): Stream<RESP.Value>;

declare function encodeToWireFormat(
  input: Stream<RESP.Value>
): Stream<Uint8Array>;

const processStream = flow(
  decodeFromWireFormat,
  parseToCommands,
  handleCommand,
  encodeToWireFormat
);

//

export class SimpleString extends Schema.TaggedClass<SimpleString>(
  "SimpleString"
)("SimpleString", {
  value: Schema.String,
}) {
  static readonly WireFormat = Schema.String.pipe(
    Schema.startsWith("+"),
    Schema.endsWith("\r\n"),
    Schema.transform(Schema.String, {
      decode: (s) => s.slice(1, -2),
      encode: (s) => `+${s}\r\n`,
    }),
    Schema.transform(SimpleString, {
      decode: (s) => new SimpleString({ value: s }),
      encode: (s) => s.value,
    })
  );
}

//

export const Value = Schema.Union(
  SimpleString,
  Error,
  Integer,
  BulkString,
  ArraySuspended
);

export type Value = Schema.Schema.Type<typeof Value>;

export const ValueWireFormat: Schema.Schema<typeof Value.Type, string> =
  Schema.Union(
    SimpleString.WireFormat,
    Error.WireFormat,
    Integer.WireFormat,
    BulkString.WireFormat,
    Array.WireFormat
  );

//

function encodeToWireFormat(
  input: Stream.Stream<RESP.Value, RedisError, RedisServices>
): Stream.Stream<Uint8Array, RedisError, RedisServices> {
  return pipe(
    input,
    Stream.mapEffect((respValue) =>
      Schema.encode(RESP.ValueWireFormat)(respValue)
    ),
    Stream.encodeText
  );
}

//

function decodeFromWireFormat(
  input: Stream.Stream<Uint8Array, Socket.SocketError, RedisServices>
): Stream.Stream<RESP.Value, RedisError, RedisServices> {
  return pipe(
    input,
    Stream.decodeText(),
    Stream.flattenIterables,
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
}

//

import { Schema, Chunk } from "effect";
import { RedisError } from "../src/main";
import { BulkString } from "../src/RESP";

export class SET extends Schema.TaggedClass<SET>("SET")("SET", {
  key: Schema.String,
  value: Schema.String,
  expiration: Schema.Option(Schema.Duration),
}) {}

export class GET extends Schema.TaggedClass<GET>("GET")("GET", {
  key: Schema.String,
}) {}

export class DEL extends Schema.TaggedClass<DEL>("DEL")("DEL", {
  keys: Schema.Array(Schema.String),
}) {}

export const Command = Schema.Union(SET, GET, DEL);
export type Command = Schema.Schema.Type<typeof Command>;

//

export const CommandFromRESP = pipe(
  Schema.compose(RESP.Value, RESP.Array),
  Schema.transformOrFail(Schema.typeSchema(Command), {
    decode: ({ value }, _, ast) =>
      Effect.gen(function* () {
        // ...

        switch (command) {
          case "SET": {
            return new Commands.SET({
              key: args[0],
              value: args[1],
              expiration: args[2],
            });
          }
          case "GET":
            return new Commands.GET({
              key: args[0],
            });

          // ...
        }
      }),
    encode: (command, _, ast) => void 0,
  })
);

//

function parseToCommands(
  input: Stream.Stream<RESP.Value>
): Stream.Stream<Command> {
  return pipe(
    input,
    Stream.mapEffect((value) =>
      Schema.decode(CommandFromRESP)(value).pipe(
        Effect.tapError((e) => Effect.logError("Error parsing command", e)),
        Effect.either,
        Effect.filterMap(Either.getRight)
      )
    )
  );
}

//

function handleCommand(
  input: Stream.Stream<Command>
): Stream.Stream<RESP.Value, _, Storage> {
  return pipe(
    input,
    Stream.mapEffect((value) =>
      Effect.gen(function* () {
        const storage = yield* Storage;
        const result = yield* storage.run(input);
        return result;
      })
    )
  );
}

//

export interface StorageImpl {
  run(command: Command): Effect.Effect<RESP.Value, StorageError>;
}

export class Storage extends Context.Tag("Storage")<Storage, StorageImpl>() {}

//

export const basicInMemory = Layer.sync(Storage, () => {
  const storage = new Map<string, string>();
  return {
    run: (command) =>
      Effect.gen(function* () {
        switch (command._tag) {
          case "SET": {
            storage.set(command.key, command.value);
            return new RESP.SimpleString({ value: "OK" });
          }
          case "GET": {
            const value = storage.get(command.key);
            if (value === undefined) {
              return new RESP.BulkString({ value: null });
            } else {
              return new RESP.BulkString({ value });
            }
          }
          default: {
            return new RESP.Error({ value: "Unknown command" });
          }
        }
      }),
  };
});

//

import { Option, DateTime } from "effect";
import { Execution, CommandJSON } from "../src/Command";

type StoredValue = {
  value: string;
  expiration: Option.Option<DateTime.DateTime>;
};

export const basicInMemory = Layer.sync(Storage, () => {
  const storage = new Map<string, StoredValue>();
  return {
    run: (command) =>
      Effect.gen(function* () {
        switch (command._tag) {
          case "SET": {
            const now = yield* DateTime.now;
            const expiration = command.expiration.pipe(
              Option.map((duration) => DateTime.addDuration(now, duration))
            );
            storage.set(command.key, {
              value: command.value,
              expiration,
            });
            return new RESP.SimpleString({ value: "OK" });
          }
          // ...
        }
      }),
  };
});

//

export const basicInMemory = Layer.sync(Storage, () => {
  const storage = new Map<string, StoredValue>();
  return {
    run: (command) =>
      Effect.gen(function* () {
        switch (command._tag) {
          case "GET": {
            const now = yield* DateTime.now;
            return pipe(
              storage.get(command.key),
              Option.fromNullable,
              Option.flatMap((value) => {
                if (Option.isSome(value.expiration)) {
                  const expiration = value.expiration.value;
                  if (DateTime.lessThan(expiration, now)) {
                    return Option.none();
                  } else {
                    return Option.some(value);
                  }
                } else {
                  return Option.some(value);
                }
              }),
              Option.match({
                onSome: (value) => new RESP.BulkString({ value: value.value }),
                onNone: () => new RESP.BulkString({ value: null }),
              })
            );
          }
          // ...
        }
      }),
  };
});

//

export const basicInMemory = (purgeInterval?: Duration.Duration) =>
  Layer.scoped(
    Storage,
    Effect.gen(function* () {
      const storage = new Map<string, StoredValue>();

      const purgeExpired = Effect.gen(function* () {
        const now = yield* DateTime.now;
        for (const [key, value] of storage) {
          if (Option.isSome(value.expiration)) {
            const expiration = value.expiration.value;
            if (DateTime.lessThan(expiration, now)) {
              storage.delete(key);
            }
          }
        }
      });

      yield* pipe(
        purgeExpired,
        Effect.repeat(purgeInterval ?? Duration.seconds(5)),
        Effect.forkScoped
      );

      return {
        run: (command) =>
          Effect.gen(function* () {
            // ...
          }),
      };
    })
  );

//

export interface StorageImpl {
  run(command: Command): Effect.Effect<RESP.Value, StorageError>;
  runTransaction(
    commands: ReadonlyArray<Command>
  ): Effect.Effect<Array<RESP.Value>, StorageError>;
}

export class Storage extends Context.Tag("Storage")<Storage, StorageImpl>() {}

//

type Store = TRef.TRef<HashMap.HashMap<string, StoredValue>>;

type StoredValue = Data.TaggedEnum<{
  String: { value: string };
  List: {
    value: Chunk.Chunk<string>;
  };
  Hash: {
    value: HashMap.HashMap<string, string>;
  };
  Set: {
    value: HashSet.HashSet<string>;
  };
}> & {
  expiration: Option.Option<DateTime.DateTime>;
};

//

class STMBackedInMemoryStore implements StorageImpl {
  constructor(readonly store: Store) {}

  static make = Effect.gen(function* () {
    const tmap = yield* TRef.make(HashMap.empty<string, StoredValue>());
    return new STMBackedInMemoryStore(tmap);
  });

  processCommandToSTM(
    command: CommandTypes.Storage,
    now: DateTime.Utc
  ): STM.STM<RESP.Value> {
    switch (command._tag) {
      case "GET":
        return this.GET(command, now);
      case "SET":
        return this.SET(command, now);
    }
  }

  GET(command: Commands.GET, now: DateTime.Utc) {
    return STM.gen(this, function* () {
      const value = yield* TRef.get(this.store).pipe(STM.map(HashMap.get(key)));
      // ...
    });
  }

  SET(command: Commands.SET, now: DateTime.Utc) {
    return STM.gen(this, function* () {
      yield* TRef.update(this.store, HashMap.set(map, key, value));
      // ...
    });
  }

  run(command: Command): Effect.Effect<RESP.Value, StorageError> {
    return Effect.gen(this, function* () {
      const now = yield* DateTime.now;
      const stm = this.processCommandToSTM(command, now);
      return yield* STM.commit(stm);
    });
  }
}

//

class STMBackedInMemoryStore implements StorageImpl {
  // ...

  run(command: Command): Effect.Effect<RESP.Value, StorageError> {
    return Effect.gen(this, function* () {
      const now = yield* DateTime.now;
      const stm = this.processCommandToSTM(command, now);
      return yield* STM.commit(stm);
    });
  }

  runTransaction(
    commands: Array<CommandTypes.Storage>
  ): Effect.Effect<Array<RESP.Value>, StorageError, never> {
    return Effect.gen(this, function* () {
      const now = yield* DateTime.now;
      const stms = commands.map((command) =>
        this.processCommandToSTM(command, now)
      );
      const all = STM.all(stms);
      return yield* STM.commit(all);
    });
  }

  // ...
}

//

interface TransactionDriverImpl {
  isRunningTransaction: Effect.Effect<boolean, TransactionError>;
  startTransaction: Effect.Effect<void, TransactionError>;
  appendToCurrentTransaction: (
    command: Command
  ) => Effect.Effect<void, TransactionError>;
  abortCurrentTransaction: Effect.Effect<void, TransactionError>;
  executeCurrentTransaction: Effect.Effect<
    Array<RESP.Value>,
    TransactionError | StorageError,
    Storage
  >;
}

export class TransactionDriver extends Context.Tag("TransactionDriver")<
  TransactionDriver,
  TransactionDriverImpl
>() {}

//

function handleCommand(
  input: Stream.Stream<Command>
): Stream.Stream<RESP.Value, _, Storage> {
  return pipe(
    input,
    Stream.mapEffect((value) =>
      Effect.gen(function* () {
        if (Schema.is(CommandTypes.Execution)(value)) {
          const result = handleExecutionCommand(value);
        } else {
          const storage = yield* Storage;
          const result = yield* storage.run(value);
          return result;
        }
      })
    )
  );
}

declare function handleExecutionCommand(
  input: CommandTypes.Execution
): Stream.Stream<RESP.Value, RedisError, RedisServices>;

//

function handleExecutionCommand(
  input: CommandTypes.Execution
): Stream.Stream<RESP.Value, RedisError, RedisServices> {
  return Effect.gen(function* () {
    const Tx = yield* TransactionDriver;
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
    }
  });
}

//

const handleConnection = (socket: Socket.Socket) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("New connection");
    const channel = Socket.toChannel<never>(socket);

    const rawInputStream = Stream.never.pipe(
      Stream.pipeThroughChannel(channel)
    );
    const rawOutputSink = Channel.toSink(channel);

    yield* rawInputStream.pipe(processStream, Stream.run(rawOutputSink));
  }).pipe(
    Effect.provide(Layer.fresh(TransactionDriver.layer)),
    Effect.onExit(() => Effect.logInfo("Connection closed"))
  );

//

interface PubSubDriverImpl {
  subscribe: (
    channels: ReadonlyArray<string>
  ) => Effect.Effect<Stream.Stream<PubSubMessage>, never, Scope.Scope>;
  publish: Queue.Enqueue<PubSubMessage>;
}

export class PubSubDriver extends Context.Tag("PubSubDriver")<
  PubSubDriver,
  PubSubDriverImpl
>() {}

//

function handlePubSubCommand(
  input: Stream.Stream<Command>
): Stream.Stream<RESP.Value, RedisError, RedisServices> {
  return pipe(
    input,
    Stream.mapAccumEffect(Option.none(), (subscription, command) =>
      Effect.gen(function* () {
        const pubSub = yield* PubSubDriver;
        switch (value._tag) {
          case "SUBSCRIBE": {
            const driver = yield* PubSubDriver;
            const scope = yield* Scope.make();
            const stream = yield* driver
              .subscribe(command.channels)
              .pipe(Scope.extend(scope));
            return [Option.some(scope), stream];
          }
          case "UNSUBSCRIBE": {
            if (Option.isSome(subscription)) {
              yield* Scope.close(subscription.value, Exit.void);
            }
            return [Option.none(), Stream.empty];
          }
          case "PUBLISH": {
            const driver = yield* PubSubDriver;
            yield* driver.publish.offer(command);
            return [
              subscription,
              Stream.make(new RESP.SimpleString({ value: "OK" })),
            ];
          }
        }
      })
    ),
    Stream.flatMap({ concurrency: 2 })
  );
}

//

export interface LogPersistenceImpl {
  drain: Queue.Enqueue<Command>;
  load: Effect.Effect<ReadonlyArray<Command>>;
}

export class LogPersistence extends Context.Tag("LogPersistence")<
  LogPersistence,
  LogPersistenceImpl
>() {}

//
const CommandJSON = Schema.parseJson(Command);

export const LogToAppendOnlyFileLive = (fileName: string) =>
  Layer.scoped(
    LogPersistence,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const file = yield* fs.open(fileName, { flag: "a" });
      const queue = yield* Queue.unbounded<Command>();

      yield* pipe(
        Effect.gen(function* () {
          const commands = yield* queue.takeAll;
          const jsons = yield* Effect.all(
            [...commands].map((command) => Schema.encode(CommandJSON)(command))
          );
          const finalString = jsons.join("\n");
          yield* file.writeAll(new TextEncoder().encode(finalString));
        }),
        Effect.forever,
        Effect.forkScoped
      );

      const load = Effect.gen(function* () {
        const contents = yield* fs.readFile(fileName);
        const jsons = new TextDecoder().decode(contents).split("\n");
        return yield* Effect.all(
          jsons.map((json) => Schema.decode(CommandJSON)(json))
        );
      }).pipe(Effect.scoped);

      return {
        drain: queue,
        load,
      };
    })
  );

//

export const withLogPersistence = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const oldStorage = yield* Storage;
    const logPersistence = yield* LogPersistence;

    const commands = yield* logPersistence.load;
    yield* oldStorage.runTransaction(commands);

    const newStorage = Storage.of({
      ...oldStorage,
      run: (command) =>
        oldStorage
          .run(command)
          .pipe(
            Effect.zipLeft(
              Schema.is(CommandTypes.StorageCommands.Effectful)(command)
                ? logPersistence.drain.offer(command)
                : Effect.void
            )
          ),
      runTransaction: (commands) =>
        oldStorage
          .runTransaction(commands)
          .pipe(
            Effect.zipLeft(
              logPersistence.drain.offerAll(
                commands.filter(
                  Schema.is(CommandTypes.StorageCommands.Effectful)
                )
              )
            )
          ),
    });
    return newStorage;
  })
);

//

main.pipe(
  Effect.provide(
    withLogPersistence.pipe(
      Layer.provide(LogToAppendOnlyFileLive("log.aof")),
      Layer.provide(STMBackedInMemoryStore.layer)
    )
  )
);

//

export interface SnapshotPersistenceImpl {
  storeSnapshot: (snapshot: Uint8Array) => Effect.Effect<void, unknown>;
  loadSnapshot: Effect.Effect<Uint8Array, unknown>;
}

export interface StorageImpl {
  run(command: CommandTypes.Storage): Effect.Effect<RESP.Value, StorageError>;
  runTransaction(
    commands: ReadonlyArray<CommandTypes.Storage>
  ): Effect.Effect<Array<RESP.Value>, StorageError>;
  generateSnapshot: Effect.Effect<Uint8Array, StorageError | ParseError>;
  restoreFromSnapshot(
    snapshot: Uint8Array
  ): Effect.Effect<void, StorageError | ParseError>;
}

//

export const FileSnapshotPersistenceLive = Layer.effect(
  SnapshotPersistence,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return {
      storeSnapshot: (snapshot) =>
        Effect.gen(function* () {
          const file = yield* fs.open("dump.rdb", { flag: "w" });
          yield* file.writeAll(snapshot);
        }).pipe(Effect.scoped),
      loadSnapshot: Effect.gen(function* () {
        const contents = yield* fs.readFile("dump.rdb");
        return contents;
      }).pipe(Effect.scoped),
    };
  })
);

export const withSnapshotPersistence = (schedule: Schedule.Schedule<unknown>) =>
  Layer.scopedDiscard(
    Effect.gen(function* () {
      const storage = yield* Storage;
      const snapshotPersistence = yield* SnapshotPersistence;

      yield* pipe(
        snapshotPersistence.loadSnapshot,
        Effect.flatMap((snapshot) => storage.restoreFromSnapshot(snapshot))
      );

      const takeAndStoreSnapshot = pipe(
        storage.generateSnapshot,
        Effect.flatMap((snapshot) =>
          snapshotPersistence.storeSnapshot(snapshot)
        )
      );

      yield* Effect.addFinalizer(() => takeAndStoreSnapshot);
      yield* pipe(
        takeAndStoreSnapshot,
        Effect.repeat(schedule),
        Effect.forkScoped
      );
    })
  );

//

main.pipe(
  Effect.provide(
    Layer.merge(
      withLogPersistence,
      withSnapshotPersistence(Schedule.fixed("5 minutes"))
    ).pipe(
      Layer.provide(LogToAppendOnlyFileLive("log.aof")),
      Layer.provide(FileSnapshotPersistenceLive),
      Layer.provide(STMBackedInMemoryStore.layer)
    )
  )
);

//

import { Command, Options } from "@effect/cli";
import { File } from "node:buffer";

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
          STMBackedInMemoryStorage.layer(),
          PubSubDriver.layer
        )
      )
    )
);

export const run = Command.run(command, {
  name: "effectis",
  version: "0.0.0",
});

//

const handleConnection: (
  socket: Socket.Socket
) => Effect.Effect<
  void,
  | ParseError
  | StorageError
  | Socket.SocketGenericError
  | Socket.SocketCloseError
  | TransactionError,
  Storage | PubSubDriver
>;

//

import { NodeStream } from "@effect/platform-node";
import { Duplex } from "node:stream";
import RedisParser from "redis-parser";

class RedisParserStream extends Duplex {}

export function decodeFromWireFormatFast(
  input: Stream.Stream<Uint8Array, Socket.SocketError, RedisServices>
): Stream.Stream<RESP.Value, RedisError, RedisServices> {
  return pipe(
    input,
    Stream.map((bytes) => Buffer.copyBytesFrom(bytes)),
    Stream.pipeThroughChannel(
      NodeStream.fromDuplex<RedisError, RedisError, Buffer, RESP.Value>(
        () => new RedisParserStream(),
        (e) => new ParserError({ cause: e })
      )
    )
  );
}
