import {
  Chunk,
  Data,
  Effect,
  FiberRef,
  Option,
  Ref,
  Layer,
  Context,
} from "effect";
import type { CommandTypes } from "./Command.js";
import { Storage, StorageError } from "./Storage.js";
import { RESP } from "./RESP.js";

export class TransactionError extends Data.TaggedError("TransactionError")<{
  message: string;
}> {}

interface TransactionDriverImpl {
  isRunningTransaction: Effect.Effect<boolean, TransactionError>;
  startTransaction: Effect.Effect<void, TransactionError>;
  appendToCurrentTransaction: (
    command: CommandTypes.Storage
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

export const layer = Layer.effect(
  TransactionDriver,
  Effect.gen(function* () {
    const state = yield* Ref.make(
      Option.none<Chunk.Chunk<CommandTypes.Storage>>()
    );

    const isRunningTransaction = Effect.gen(function* () {
      const tx = yield* Ref.get(state);
      return Option.isSome(tx);
    });

    const startTransaction = Effect.gen(function* () {
      const tx = yield* Ref.get(state);
      if (Option.isSome(tx)) {
        yield* Effect.fail(
          new TransactionError({
            message:
              "Tried to start a transaction, but one was already in progress",
          })
        );
      } else {
        yield* Effect.logInfo("Starting transaction");
        yield* Ref.set(state, Option.some(Chunk.empty()));
      }
    });

    const appendToCurrentTransaction = (command: CommandTypes.Storage) =>
      Effect.gen(function* () {
        const tx = yield* Ref.get(state);
        if (Option.isSome(tx)) {
          yield* Ref.set(state, Option.some(Chunk.append(tx.value, command)));
        } else {
          yield* Effect.fail(
            new TransactionError({
              message:
                "Tried to append to a transaction, but one was not in progress",
            })
          );
        }
      });

    const abortCurrentTransaction = Effect.gen(function* () {
      const tx = yield* Ref.get(state);
      if (Option.isSome(tx)) {
        yield* Ref.set(state, Option.none());
      }
    });

    const executeCurrentTransaction = Effect.gen(function* () {
      const tx = yield* Ref.get(state);
      const storage = yield* Storage;
      if (Option.isSome(tx)) {
        const results = yield* storage.runTransaction(Chunk.toArray(tx.value));
        yield* Ref.set(state, Option.none());
        return results;
      } else {
        return yield* Effect.fail(
          new TransactionError({
            message:
              "Tried to execute a transaction, but one was not in progress",
          })
        );
      }
    });

    return TransactionDriver.of({
      isRunningTransaction,
      startTransaction,
      appendToCurrentTransaction,
      abortCurrentTransaction,
      executeCurrentTransaction,
    });
  })
);
