import type { Chunk, DateTime, Duration, HashSet } from "effect"
import { Data, Effect, HashMap, Layer, Option, STM, TMap, TRef } from "effect"
import type { Commands, CommandTypes } from "../Command.js"
import { RESP } from "../RESP.js"
import type { StorageError, StorageImpl } from "../Storage.js"
import { Storage } from "../Storage.js"

// background cleanup fiber to remove expired keys
// store time for this in FiberRef

// because js is single threaded, well never have an inconsistent state
// however within an effect (the run command function) any effect can be a yield point
// hence we need more machinery to do concurrent transactions

type Expiration = {
  since: DateTime.DateTime
  ttl: Duration.Duration
}

type StoredValue = Data.TaggedEnum<{
  String: { value: string } & { expiration?: Expiration }
  List: { value: TRef.TRef<Chunk.Chunk<string>> } & { expiration?: Expiration }
  Hash: { value: TRef.TRef<HashMap.HashMap<string, string>> } & { expiration?: Expiration }
  Set: { value: TRef.TRef<HashSet.HashSet<string>> } & { expiration?: Expiration }
}>

const StoredValue = Data.taggedEnum<StoredValue>()

type Store = TRef.TRef<HashMap.HashMap<string, StoredValue>>

class STMBackedInMemoryStore implements StorageImpl {
  private store: Store

  constructor(store: Store) {
    this.store = store
  }

  static make = Effect.gen(function*() {
    const tmap = yield* TRef.make(HashMap.empty<string, StoredValue>())
    return new STMBackedInMemoryStore(tmap)
  })

  public run(command: CommandTypes.Storage): Effect.Effect<RESP.Value, StorageError, never> {
    const stm = this.processCommandToSTM(command)
    return STM.commit(stm)
  }

  public runTransaction(commands: Array<CommandTypes.Storage>): Effect.Effect<Array<RESP.Value>, StorageError, never> {
    const stms = commands.map(this.processCommandToSTM)
    const all = STM.all(stms)
    return STM.commit(all)
  }

  public generateSnapshot: Effect.Effect<Uint8Array, StorageError, never> = Effect.die("Not implemented")

  private processCommandToSTM(command: CommandTypes.Storage): STM.STM<RESP.Value, StorageError, never> {
    switch (command._tag) {
      case "GET":
        return this.GET(command)
      case "SET":
        return this.SET(command)
    }
    // return Match.value(command).pipe(
    //   Match.when(Predicate.isTagged("GET"), (command) => this.GET(command)),
    //   Match.when(Predicate.isTagged("SET"), (command) => this.SET(command)),
    //   Match.exhaustive
    // )
  }

  private GET(command: Commands.GET) {
    return STM.gen(this, function*() {
      const value = yield* TRef.get(this.store).pipe(STM.map(HashMap.get(command.key)))
      if (Option.isNone(value)) {
        return new RESP.Error({ value: "Key not found" })
      } else {
        if (value.value._tag === "String") {
          return new RESP.BulkString({ value: value.value.value })
        } else {
          return new RESP.Error({ value: "Key is not a string" })
        }
      }
    })
  }

  private SET(command: Commands.SET) {
    return STM.gen(this, function*() {
      yield* TRef.update(
        this.store,
        (map) => HashMap.set(map, command.key, StoredValue.String({ value: command.value }))
      )
      return new RESP.SimpleString({ value: "OK" })
    })
  }
}

export const layer = Layer.effect(Storage, STMBackedInMemoryStore.make)
