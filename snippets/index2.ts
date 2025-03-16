// @ts-nocheck

import * as SocketServer from "@effect/experimental/SocketServer";
import { Socket } from "@effect/platform";

// main: Effect<void, SocketServerError, SocketServer>
export const main = Effect.gen(function* () {
  const server = yield* SocketServer.SocketServer;
  yield* server.run(handleConnection);
});

declare const handleConnection: (socket: Socket.Socket) => Effect.Effect<void>;

import * as NodeSocketServer from "@effect/experimental/SocketServer/Node";
import { Duplex, Readable } from "node:stream";
main.pipe(Effect.provide(NodeSocketServer.layer({ port: 6379 })));
main.pipe(Effect.provide(NodeSocketServer.layerWebSocket({ port: 1234 })));

//

const handleConnection = (socket: Socket.Socket) =>
  Effect.gen(function* () {
    const channel = Socket.toChannel(socket);
  });

// channel ~= Channel<Uint8Array, Uint8Array | string | CloseEvent, SocketError>

import * as NodeStream from "node:stream";

type Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env> =
  NodeStream.Duplex;
type Stream<Out, Err, Env> = NodeStream.Readable;
type Sink<Out, In, Leftover, Err, Env> = NodeStream.Writable;

// web streams
type Channel<O, I, OE, IE, OD, ID, R> = TransformStream<I, O>;
type Stream<O, E, R> = ReadableStream<O>;
type Sink<O, I, L, E, R> = WritableStream<I>;

//

declare function decodeFromWireFormat(
  input: Stream<Uint8Array>
): Stream<RESP.Value>;

declare function parseToCommands(input: Stream<RESP.Value>): Stream<Command>;

declare function handleCommand(input: Stream<Command>): Stream<RESP.Value>;

declare function encodeToWireFormat(
  input: Stream<RESP.Value>
): Stream<Uint8Array>;

// processStream: (input: Stream<Uint8Array>) => Stream<Uint8Array>
const processStream = flow(
  decodeFromWireFormat,
  parseToCommands,
  handleCommand,
  encodeToWireFormat
);

//

const input = "*2\r\n+OK\r\n-ERR\r\n";
const output = {
  _tag: "Array",
  value: [
    {
      _tag: "SimpleString",
      value: "OK",
    },
    {
      _tag: "Error",
      value: "ERR",
    },
  ],
};

//

const SimpleString = Schema.TaggedStruct("SimpleString", {
  value: Schema.String,
});

// Schema<SimpleString, string>
const RESPSimpleString = Schema.String.pipe(
  Schema.startsWith("+"),
  Schema.endsWith("\r\n"),
  Schema.transform(Schema.String, {
    decode: (s) => s.slice(1, -2),
    encode: (s) => `+${s}\r\n`,
  }),
  Schema.transform(SimpleString, {
    decode: (s) => SimpleString.make({ value: s }),
    encode: (s) => s.value,
  })
);

//

export const RESPValue = Schema.Union(
  RESPSimpleString,
  RESPBulkString,
  RESPError,
  RESPInteger,
  RESPArray
);

export type RESPValue = Schema.Schema.Type<typeof RESPValue>;

//

export interface StorageImpl {
  run(command: Command): Effect.Effect<RESP.Value, StorageError>;
}

export class Storage extends Context.Tag("Storage")<Storage, StorageImpl>() {}

class InMemoryStore implements StorageImpl {
  store: Store;
  static make = Effect.gen(function* () {});
  run(command: Command): Effect.Effect<RESP.Value, StorageError> {
    // ...
  }
}

const layer = Layer.effect(Storage, InMemoryStore.make);
//

type Store = HashMap<string, StoredValue>;

import { Option, Chunk, DateTime, HashMap, HashSet } from "effect";

type StoredValue = Data.TaggedEnum<{
  String: { value: string; expiration: Option<DateTime> };
  List: {
    value: Chunk<string>;
    expiration: Option<DateTime>;
  };
  Hash: {
    value: HashMap<string, string>;
    expiration: Option<DateTime>;
  };
  Set: {
    value: HashSet<string>;
    expiration: Option<DateTime>;
  };
}>;

//

const StoredValue = Schema.Union(
  StoredString,
  StoredList,
  StoredHash,
  StoredSet
);
type StoredValue = Schema.Schema.Type<typeof StoredValue>;

const Store = Schema.HashMap({
  key: Schema.String,
  value: StoredValue,
});
type Store = Schema.Schema.Type<typeof Store>;

const StoreSnapshot = Schema.transform(Schema.Uint8ArrayFromSelf, Store, {
  encode,
  decode,
});

//

import { Option, DateTime } from "effect";

function getFromStore(store: Store, key: string): Effect<Option<StoredValue>> {
  return Effect.gen(function* () {
    const now = yield* DateTime.now;
    const value = HashMap.get(store, key);

    if (Option.isSome(value) && Option.isSome(value.value.expiration)) {
      const expiration = value.value.expiration.value;
      if (DateTime.lessThan(expiration, now)) {
        return Option.none();
      } else {
        return Option.some(value.value);
      }
    } else {
      return value;
    }
  });
}

//

export const layer = (options: { expiredPurgeInterval: Duration.Duration }) =>
  Layer.scoped(
    Storage,
    Effect.gen(function* () {
      const store = yield* StoreImpl.make;

      yield* pipe(
        purgeExpired(store),
        Effect.repeat(Schedule.spaced(options.expiredPurgeInterval)),
        Effect.forkScoped
      );

      return store;
    })
  );

//

function GET(command: { key: string; expiration: Option<Duration> }) {
  return Effect.gen(function* () {
    const now = yield* DateTime.now;
    const expiration = command.expiration.pipe(
      Option.map((duration) => DateTime.addDuration(now, duration))
    );

    this.setStore(
      command.key,
      new Stored.String({ value: command.value, expiration })
    );
    return new RESP.SimpleString({ value: "OK" });
  });
}

//

interface StorageImpl {
  // ...
  generateSnapshot: Effect.Effect<Uint8Array, StorageError>;
}

interface SnapshotPersistenceImpl {
  storeSnapshot: (snapshot: Uint8Array) => Effect.Effect<void>;
}

class SnapshotPersistence extends Context.Tag("SnapshotPersistence") {} // ...

import { FileSystem } from "@effect/platform";

const FileSnapshotPersistenceLive = Layer.effect(
  SnapshotPersistence,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return {
      storeSnapshot: (snapshot) =>
        Effect.gen(function* () {
          const file = yield* fs.open("dump.rdb", { flag: "w" });
          yield* file.writeAll(snapshot);
        }).pipe(Effect.scoped),
    };
  })
);

//

// Layer<void, StorageError, Storage | SnapshotPersistence>
const withSnapshotPersistence = (schedule: Schedule<unknown>) =>
  Layer.scopedDiscard(
    Effect.gen(function* () {
      const storage = yield* Storage;
      const snapshotPersistence = yield* SnapshotPersistence;

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

// before:
type Store = HashMap.HashMap<string, StoredValue>;

function get(store: Store, key: string): Effect<Option<StoredValue>> {
  return Effect.gen(function* () {
    return HashMap.get(store, key);
  });
}

// after:
type Store = TRef.TRef<HashMap.HashMap<string, StoredValue>>;

function get(store: Store, key: string): STM<Option<StoredValue>> {
  return STM.gen(function* () {
    return yield* TRef.get(store).pipe(STM.map(HashMap.get(key)));
  });
}

function run(store: Store, command: Command): Effect<RESP.Value> {
  return Effect.gen(function* () {
    const stm = getSTM(store, command);
    return yield* STM.commit(stm);
  });
}

//

function runTransaction(
  store: Store,
  commands: Array<Command>
): Effect<Array<RESP.Value>> {
  return Effect.gen(function* () {
    const stms = commands.map((command) => getSTM(store, command));
    const all = STM.all(stms);
    return yield* STM.commit(all);
  });
}

//

interface TransactionDriverImpl {
  isRunningTransaction: Effect<boolean>;
  startTransaction: Effect<void>;
  appendToCurrentTransaction: (command: Command) => Effect<void>;
  abortCurrentTransaction: Effect<void>;
  executeCurrentTransaction: Effect<Array<RESP.Value>, _, Storage>;
}

export class TransactionDriver extends Context.Tag("TransactionDriver")<
  TransactionDriver,
  TransactionDriverImpl
>() {}

export const layer = Layer.effect(
  TransactionDriver,
  Effect.gen(function* () {
    const state = yield* Ref.make(
      Option.none<Chunk.Chunk<CommandTypes.Storage>>()
    );

    // ...
  })
);

//

export class PubSubMessage extends Data.TaggedClass("PubSubMessage")<{
  channel: string;
  message: string;
}> {}

interface PubSubDriverImpl {
  subscribe: (
    channels: Array<string>
  ) => Effect<Stream.Stream<PubSubMessage>, _, Scope.Scope>;
  publish: Queue.Enqueue<PubSubMessage>;
}

export class PubSubDriver extends Context.Tag("PubSubDriver")<
  PubSubDriver,
  PubSubDriverImpl
>() {}

//

export const layer = Layer.effect(
  PubSubDriver,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<PubSubMessage>();

    // ...
  })
);

//

import { Options, Command } from "@effect/cli";
import { effect } from "effect/Layer";

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
