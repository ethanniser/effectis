import { FileSystem } from "@effect/platform"
import { Context, Effect, Layer, pipe, Queue, Schedule, Schema } from "effect"
import type { Command } from "./Command.js"
import type { RESP } from "./RESP.js"

// add combinators to add log and flush persistence (with seperate persistence layer)

export class StorageError extends Schema.TaggedError<StorageError>("StorageError")("StorageError", {
  message: Schema.String
}) {}

export interface StorageImpl {
  run(command: Command): Effect.Effect<RESP.Value, StorageError, never>
  generateSnapshot: Effect.Effect<Uint8Array, StorageError, never>
}

export class Storage extends Context.Tag("Storage")<Storage, StorageImpl>() {}

export interface LogPersistenceImpl {
  drain: Queue.Enqueue<Command>
}

export class LogPersistence extends Context.Tag("LogPersistence")<LogPersistence, LogPersistenceImpl>() {}

const isSchedule = (s: unknown): s is Schedule.Schedule<unknown> =>
  typeof s === "object" && s !== null && Schedule.ScheduleTypeId in s

export const LogToAppendOnlyFileLive = (
  fileName: string,
  options: { sync: "always" | "no" | Schedule.Schedule<unknown> } = { sync: Schedule.fixed("1 second") }
) =>
  Layer.scoped(
    LogPersistence,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const file = yield* fs.open(fileName, { flag: "a" })
      const queue = yield* Queue.unbounded<Command>()

      if (isSchedule(options.sync)) {
        yield* pipe(
          Effect.gen(function*() {
            // fsync
          }),
          Effect.repeat(options.sync),
          Effect.forkScoped
        )
      }

      yield* pipe(
        Effect.gen(function*() {
          const commands = yield* queue.takeAll
          // filter for write only
          // serialize
          yield* file.writeAll(new Uint8Array())
          if (options.sync === "always") {
            // fsync
          }
        }),
        Effect.forever,
        Effect.forkScoped
      )

      return {
        drain: queue
      }
    })
  )

export const withLogPersistence = (
  storage: Layer.Layer<Storage>,
  logPersistence: Layer.Layer<LogPersistence>
): Layer.Layer<Storage> =>
  Layer.map(Layer.merge(storage, logPersistence), (oldCtx) => {
    const oldStorage = Context.get(oldCtx, Storage)
    const logPersistence = Context.get(oldCtx, LogPersistence)
    const newStorage = Storage.of({
      ...oldStorage,
      run: (command) => oldStorage.run(command).pipe(Effect.zipLeft(logPersistence.drain.offer(command)))
    })
    return Context.make(Storage, newStorage)
  })

export interface SnapshotPersistenceImpl {
  storeSnapshot: (snapshot: Uint8Array) => Effect.Effect<void, unknown>
}

export class SnapshotPersistence
  extends Context.Tag("SnapshotPersistence")<SnapshotPersistence, SnapshotPersistenceImpl>()
{}

export const FileSnapshotPersistenceLive = (fileName: string) =>
  Layer.effect(
    SnapshotPersistence,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const file = yield* fs.open(fileName, { flag: "w" })
      return {
        storeSnapshot: (snapshot) => file.writeAll(snapshot)
      }
    })
  )
