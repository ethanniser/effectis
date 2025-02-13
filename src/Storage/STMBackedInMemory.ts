import type { Chunk, HashSet } from "effect";
import {
  Data,
  DateTime,
  Duration,
  Effect,
  HashMap,
  Layer,
  Option,
  pipe,
  Schedule,
  STM,
  TRef,
} from "effect";
import type { Commands, CommandTypes } from "../Command.js";
import { RESP } from "../RESP.js";
import type { StorageImpl } from "../Storage.js";
import { Storage, StorageError } from "../Storage.js";

// background cleanup fiber to remove expired keys
// store time for this in FiberRef

// because js is single threaded, well never have an inconsistent state
// however within an effect (the run command function) any effect can be a yield point
// hence we need more machinery to do concurrent transactions

type StoredValue = Data.TaggedEnum<{
  String: { value: string } & { expiration: Option.Option<DateTime.DateTime> };
  List: { value: TRef.TRef<Chunk.Chunk<string>> } & {
    expiration: Option.Option<DateTime.DateTime>;
  };
  Hash: { value: TRef.TRef<HashMap.HashMap<string, string>> } & {
    expiration: Option.Option<DateTime.DateTime>;
  };
  Set: { value: TRef.TRef<HashSet.HashSet<string>> } & {
    expiration: Option.Option<DateTime.DateTime>;
  };
}>;

const StoredValue = Data.taggedEnum<StoredValue>();

type Store = TRef.TRef<HashMap.HashMap<string, StoredValue>>;

class STMBackedInMemoryStore implements StorageImpl {
  readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  static make = Effect.gen(function* () {
    const tmap = yield* TRef.make(HashMap.empty<string, StoredValue>());
    return new STMBackedInMemoryStore(tmap);
  });

  run(command: CommandTypes.Storage): Effect.Effect<RESP.Value, StorageError> {
    return Effect.gen(this, function* () {
      const now = yield* DateTime.now;
      yield* Effect.logTrace("Storage running command: ", command);
      const stm = this.processCommandToSTM(command, now);
      return yield* STM.commit(stm);
    });
  }

  runTransaction(
    commands: Array<CommandTypes.Storage>
  ): Effect.Effect<Array<RESP.Value>, StorageError, never> {
    return Effect.gen(this, function* () {
      const now = yield* DateTime.now;
      yield* Effect.logTrace("Storage running transaction: ", commands);
      const stms = commands.map((command) =>
        this.processCommandToSTM(command, now)
      );
      const all = STM.all(stms);
      return yield* STM.commit(all);
    });
  }

  generateSnapshot: Effect.Effect<Uint8Array, StorageError, never> =
    Effect.die("Not implemented");
  restoreFromSnapshot(
    _snapshot: Uint8Array
  ): Effect.Effect<void, StorageError, never> {
    return Effect.die("Not implemented");
  }

  purgeExpired: Effect.Effect<void, StorageError, never> = Effect.gen(
    this,
    function* () {
      const now = yield* DateTime.now;
      yield* pipe(
        this.store,
        TRef.update((map) =>
          HashMap.filter(
            map,
            (value) =>
              Option.isSome(value.expiration) &&
              DateTime.lessThan(now, value.expiration.value)
          )
        ),
        STM.commit
      );
    }
  );

  processCommandToSTM(
    command: CommandTypes.Storage,
    now: DateTime.DateTime
  ): STM.STM<RESP.Value, StorageError, never> {
    switch (command._tag) {
      case "GET":
        return this.GET(command, now);
      case "SET":
        return this.SET(command, now);
      case "DEL":
        return this.DEL(command);
      case "EXISTS":
        return this.EXISTS(command, now);
      case "EXPIRE":
        return this.EXPIRE(command, now);
      case "TTL":
        return this.TTL(command, now);
      case "PERSIST":
        return this.PERSIST(command, now);
      case "TYPE":
        return this.TYPE(command, now);
      case "FLUSHALL":
        return this.FLUSHALL();
      default:
        return STM.fail(
          new StorageError({
            message: `Storage does not support command: ${command._tag}`,
          })
        );
    }
  }

  getStore(
    key: string,
    now: DateTime.DateTime
  ): STM.STM<Option.Option<StoredValue>> {
    return STM.gen(this, function* () {
      const value = yield* TRef.get(this.store).pipe(STM.map(HashMap.get(key)));
      return Option.flatMap(value, (value) => {
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
      });
    });
  }

  setStore(key: string, value: StoredValue): STM.STM<void> {
    console.log("setStore", key, value);
    return TRef.update(this.store, (map) => HashMap.set(map, key, value));
  }

  removeStore(key: string): STM.STM<void> {
    return TRef.update(this.store, (map) => HashMap.remove(map, key));
  }

  GET(command: Commands.GET, now: DateTime.DateTime) {
    return STM.gen(this, function* () {
      const value = yield* this.getStore(command.key, now);
      if (Option.isNone(value)) {
        return new RESP.BulkString({ value: null });
      } else {
        if (value.value._tag === "String") {
          return new RESP.BulkString({ value: value.value.value });
        } else {
          return new RESP.Error({ value: "Key is not a string" });
        }
      }
    });
  }

  SET(command: Commands.SET, now: DateTime.DateTime) {
    return STM.gen(this, function* () {
      const prev = yield* this.getStore(command.key, now);
      const expiration = Option.fromNullable(command.expiration).pipe(
        Option.map((duration) => DateTime.addDuration(now, duration))
      );
      if (command.mode === "NX") {
        if (Option.isSome(prev)) {
          return new RESP.SimpleString({ value: "OK" });
        } else {
          yield* this.setStore(
            command.key,
            StoredValue.String({ value: command.value, expiration })
          );
          return new RESP.SimpleString({ value: "OK" });
        }
      } else if (command.mode === "XX") {
        if (Option.isSome(prev)) {
          yield* this.setStore(
            command.key,
            StoredValue.String({ value: command.value, expiration })
          );
          return new RESP.SimpleString({ value: "Ok" });
        } else {
          return new RESP.SimpleString({ value: "OK" });
        }
      } else {
        yield* this.setStore(
          command.key,
          StoredValue.String({ value: command.value, expiration })
        );
        return new RESP.SimpleString({ value: "OK" });
      }
    });
  }

  DEL(command: Commands.DEL) {
    return STM.gen(this, function* () {
      for (const key of command.keys) {
        yield* this.removeStore(key);
      }
      return new RESP.SimpleString({ value: "OK" });
    });
  }

  EXISTS(command: Commands.EXISTS, now: DateTime.DateTime) {
    return STM.gen(this, function* () {
      let count = 0;
      for (const key of command.keys) {
        if (yield* this.getStore(key, now).pipe(STM.map(Option.isSome))) {
          count++;
        }
      }
      return new RESP.Integer({ value: count });
    });
  }

  EXPIRE(command: Commands.EXPIRE, now: DateTime.DateTime) {
    return STM.gen(this, function* () {
      const prev = yield* this.getStore(command.key, now);
      if (command.mode === "NX") {
        if (
          Option.flatMap(prev, (value) => value.expiration).pipe(Option.isNone)
        ) {
          return new RESP.Integer({ value: 0 });
        }
      } else if (command.mode === "XX") {
        if (
          Option.flatMap(prev, (value) => value.expiration).pipe(Option.isSome)
        ) {
          return new RESP.Integer({ value: 0 });
        }
      } else if (command.mode === "GT") {
        const newExpiration = DateTime.addDuration(now, command.duration);
        if (
          prev.pipe(
            Option.flatMap((value) => value.expiration),
            Option.map((expiration) =>
              DateTime.lessThanOrEqualTo(expiration, newExpiration)
            )
          )
        ) {
          return new RESP.Integer({ value: 0 });
        }
      } else if (command.mode === "LT") {
        const newExpiration = DateTime.addDuration(now, command.duration);
        if (
          prev.pipe(
            Option.flatMap((value) => value.expiration),
            Option.map((expiration) =>
              DateTime.greaterThanOrEqualTo(expiration, newExpiration)
            )
          )
        ) {
          return new RESP.Integer({ value: 0 });
        }
      }
      if (Option.isNone(prev)) {
        return new RESP.Integer({ value: 0 });
      }
      const expiration = DateTime.addDuration(now, command.duration);
      yield* this.setStore(command.key, {
        ...prev.value,
        expiration: Option.some(expiration),
      });
      return new RESP.Integer({ value: 1 });
    });
  }

  TTL(command: Commands.TTL, now: DateTime.DateTime) {
    return STM.gen(this, function* () {
      const prev = yield* this.getStore(command.key, now);
      if (Option.isNone(prev)) {
        return new RESP.Integer({ value: -1 });
      }
      const expiration = Option.flatMap(prev, (value) => value.expiration);
      if (Option.isSome(expiration)) {
        const ttl = DateTime.distanceDuration(now, expiration.value);
        return new RESP.Integer({ value: Duration.toMillis(ttl) });
      } else {
        return new RESP.Integer({ value: -2 });
      }
    });
  }

  PERSIST(command: Commands.PERSIST, now: DateTime.DateTime) {
    return STM.gen(this, function* () {
      const prev = yield* this.getStore(command.key, now);
      if (Option.isNone(prev)) {
        return new RESP.Integer({ value: 0 });
      }
      yield* this.setStore(command.key, {
        ...prev.value,
        expiration: Option.none(),
      });
      return new RESP.Integer({ value: 1 });
    });
  }

  TYPE(command: Commands.TYPE, now: DateTime.DateTime) {
    return STM.gen(this, function* () {
      const prev = yield* this.getStore(command.key, now);
      if (Option.isNone(prev)) {
        return new RESP.SimpleString({ value: "none" });
      }
      switch (prev.value._tag) {
        case "String":
          return new RESP.SimpleString({ value: "string" });
        case "List":
          return new RESP.SimpleString({ value: "list" });
        case "Hash":
          return new RESP.SimpleString({ value: "hash" });
        case "Set":
          return new RESP.SimpleString({ value: "set" });
        default:
          return new RESP.SimpleString({ value: "none" });
      }
    });
  }

  FLUSHALL() {
    return STM.gen(this, function* () {
      yield* TRef.set(this.store, HashMap.empty<string, StoredValue>());
      return new RESP.SimpleString({ value: "OK" });
    });
  }
}

interface STMBackedInMemoryStoreOptions {
  expiredPurgeInterval: Duration.Duration;
}

export const layer = (
  options: STMBackedInMemoryStoreOptions = {
    expiredPurgeInterval: Duration.seconds(5),
  }
) =>
  Layer.scoped(
    Storage,
    Effect.gen(function* () {
      const store = yield* STMBackedInMemoryStore.make;

      yield* pipe(
        store.purgeExpired,
        Effect.repeat(Schedule.spaced(options.expiredPurgeInterval)),
        Effect.forkScoped
      );

      return store;
    })
  );
