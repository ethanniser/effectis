import { Chunk, Data, Effect, FiberRef, Option } from "effect";
import type { CommandTypes } from "./Command.js";
import { Storage } from "./Storage.js";

export class TransactionError extends Data.TaggedError("TransactionError")<{
  message: string;
}> {}

const currentTransactionFiberRef = FiberRef.unsafeMake<
  Option.Option<Chunk.Chunk<CommandTypes.Storage>>
>(Option.none());

export const isRunningTransaction = FiberRef.get(
  currentTransactionFiberRef
).pipe(Effect.map(Option.isSome));

export const startTransaction = Effect.gen(function* () {
  const tx = yield* FiberRef.get(currentTransactionFiberRef);
  if (Option.isSome(tx)) {
    yield* Effect.fail(
      new TransactionError({
        message:
          "Tried to start a transaction, but one was already in progress",
      })
    );
  } else {
    yield* Effect.logInfo("Starting transaction");
    yield* FiberRef.set(currentTransactionFiberRef, Option.some(Chunk.empty()));
  }
});
export const appendToCurrentTransaction = (command: CommandTypes.Storage) =>
  Effect.gen(function* () {
    const tx = yield* FiberRef.get(currentTransactionFiberRef);
    if (Option.isSome(tx)) {
      yield* FiberRef.set(
        currentTransactionFiberRef,
        Option.some(Chunk.append(tx.value, command))
      );
    } else {
      yield* Effect.fail(
        new TransactionError({
          message:
            "Tried to append to a transaction, but one was not in progress",
        })
      );
    }
  });
export const abortCurrentTransaction = FiberRef.set(
  currentTransactionFiberRef,
  Option.none()
);
export const executeCurrentTransaction = Effect.gen(function* () {
  const transaction = yield* FiberRef.get(currentTransactionFiberRef);
  const storage = yield* Storage;
  if (Option.isSome(transaction)) {
    const results = yield* storage.runTransaction(
      Chunk.toArray(transaction.value)
    );
    yield* FiberRef.set(currentTransactionFiberRef, Option.none());
    return results;
  } else {
    return yield* Effect.fail(
      new TransactionError({
        message: "Tried to execute a transaction, but one was not in progress",
      })
    );
  }
});
