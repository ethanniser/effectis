import { FileSystem } from "@effect/platform";
import { Context, Effect, Layer, pipe, Queue, Schedule, Schema } from "effect";
import { CommandTypes, StorageCommandJSON } from "./Command.js";
import type { RESP } from "./RESP.js";
import { ParseError } from "effect/ParseResult";

// ! todo I dont think the two storage modes are compatible rn just because they both try to restore

export class StorageError extends Schema.TaggedError<StorageError>(
  "StorageError"
)("StorageError", {
  message: Schema.String,
}) {}

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

export class Storage extends Context.Tag("Storage")<Storage, StorageImpl>() {}

export interface LogPersistenceImpl {
  drain: Queue.Enqueue<CommandTypes.StorageCommands.Effectful>;
  load: Effect.Effect<ReadonlyArray<CommandTypes.StorageCommands.Effectful>>;
}

export class LogPersistence extends Context.Tag("LogPersistence")<
  LogPersistence,
  LogPersistenceImpl
>() {}

const isSchedule = (s: unknown): s is Schedule.Schedule<unknown> =>
  typeof s === "object" && s !== null && Schedule.ScheduleTypeId in s;

export const LogToAppendOnlyFileLive = (
  fileName: string,
  options: { sync: "always" | "no" | Schedule.Schedule<unknown> } = {
    sync: Schedule.fixed("1 second"),
  }
) =>
  Layer.scoped(
    LogPersistence,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const file = yield* fs.open(fileName, { flag: "a" });
      const stat = yield* file.stat;
      const queue =
        yield* Queue.unbounded<CommandTypes.StorageCommands.Effectful>();

      if (isSchedule(options.sync)) {
        yield* pipe(
          Effect.gen(function* () {
            yield* file.sync;
          }),
          Effect.repeat(options.sync),
          Effect.forkScoped
        );
      }

      yield* pipe(
        Effect.gen(function* () {
          const commands = yield* queue.takeAll;
          const jsons = yield* Effect.all(
            [...commands].map((command) =>
              Schema.encode(StorageCommandJSON)(command)
            )
          );
          const finalString = jsons.join("\n");
          yield* file.writeAll(new TextEncoder().encode(finalString));
          if (options.sync === "always") {
            yield* file.sync;
          }
        }),
        Effect.forever,
        Effect.forkScoped
      );

      const load = Effect.gen(function* () {
        const contents = yield* fs.readFile(fileName);
        const jsons = new TextDecoder().decode(contents).split("\n");
        return yield* Effect.all(
          jsons.map((json) => Schema.decode(StorageCommandJSON)(json))
        );
      }).pipe(
        Effect.catchAll((e) =>
          Effect.logError("Error loading log from file", e).pipe(
            Effect.zipRight(Effect.succeed([]))
          )
        ),
        Effect.scoped
      );

      return {
        drain: queue,
        load,
      };
    })
  );

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

export interface SnapshotPersistenceImpl {
  storeSnapshot: (snapshot: Uint8Array) => Effect.Effect<void, unknown>;
  loadSnapshot: Effect.Effect<Uint8Array, unknown>;
}

export class SnapshotPersistence extends Context.Tag("SnapshotPersistence")<
  SnapshotPersistence,
  SnapshotPersistenceImpl
>() {}

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

      yield* Effect.addFinalizer(() =>
        takeAndStoreSnapshot.pipe(
          Effect.catchAll((error) =>
            Effect.logError("Error taking exitting snapshot", error)
          )
        )
      );

      yield* pipe(
        takeAndStoreSnapshot,
        Effect.repeat(schedule),
        Effect.forkScoped
      );
    })
  );
