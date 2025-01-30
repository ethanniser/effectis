import { FileSystem } from "@effect/platform"
import { Context, DateTime, Effect, Layer, pipe, Queue, Schedule, Schema } from "effect"
import type { CommandTypes } from "./Command.js"
import type { RESP } from "./RESP.js"

// add combinators to add log and flush persistence (with seperate persistence layer)

export class StorageError extends Schema.TaggedError<StorageError>("StorageError")("StorageError", {
  message: Schema.String
}) {}

export interface StorageImpl {
  run(command: CommandTypes.Storage): Effect.Effect<RESP.Value, StorageError, never>
  generateSnapshot: Effect.Effect<Uint8Array, StorageError, never>
}

export class Storage extends Context.Tag("Storage")<Storage, StorageImpl>() {}

export interface LogPersistenceImpl {
  drain: Queue.Enqueue<CommandTypes.Storage>
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
      const queue = yield* Queue.unbounded<CommandTypes.Storage>()

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
          const _commands = yield* queue.takeAll
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

export const withLogPersistence = Layer.effect(
  Storage,
  Effect.gen(function*() {
    const oldStorage = yield* Storage
    const logPersistence = yield* LogPersistence
    const newStorage = Storage.of({
      ...oldStorage,
      run: (command) => oldStorage.run(command).pipe(Effect.zipLeft(logPersistence.drain.offer(command)))
    })
    return newStorage
  })
)

export interface SnapshotPersistenceImpl {
  storeSnapshot: (snapshot: Uint8Array) => Effect.Effect<void, unknown>
}

export class SnapshotPersistence
  extends Context.Tag("SnapshotPersistence")<SnapshotPersistence, SnapshotPersistenceImpl>()
{}

export const FileSnapshotPersistenceLive = (baseFileName: string) =>
  Layer.effect(
    SnapshotPersistence,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      return {
        storeSnapshot: (snapshot) =>
          Effect.gen(function*() {
            const time = yield* DateTime.now
            const parts = DateTime.toPartsUtc(time)
            const dateString =
              `${parts.year}-${parts.month}-${parts.day}-${parts.hours}-${parts.minutes}-${parts.seconds}`
            const fileName = `${baseFileName}-${dateString}.rdb`
            const file = yield* fs.open(fileName, { flag: "w" })
            yield* file.writeAll(snapshot)
          }).pipe(Effect.scoped)
      }
    })
  )

export const withSnapshotPersistence = (schedule: Schedule.Schedule<unknown>) =>
  Layer.scopedDiscard(
    Effect.gen(function*() {
      const storage = yield* Storage
      const snapshotPersistence = yield* SnapshotPersistence

      yield* pipe(
        Effect.gen(function*() {
          const snapshot = yield* storage.generateSnapshot
          yield* snapshotPersistence.storeSnapshot(snapshot)
        }),
        Effect.repeat(schedule), // we probably dont want this to run immediately?
        Effect.forkScoped
      )
    })
  )
