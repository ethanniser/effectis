import type { DateTime, Duration, TArray, TPubSub, TSet } from "effect"
import { Context, Data, Effect, Layer, Match, Option, Predicate, STM, TMap } from "effect"
import type { Commands, CommandTypes } from "../Command.js"
import { RESP } from "../RESP.js"
import type { StorageImpl } from "../Storage.js"
import { Storage, StorageError } from "../Storage.js"

/* value types:
String: string
List: TArray<string>
Set: TSet<string>
Channel: TPubSub<string>
*/

// background cleanup fiber to remove expired keys
// because js is single threaded, well never have an inconsistent state
// however within an effect (the run command function) any effect can be a yield point
// hence we need more machinery to do concurrent transactions

// implement as a class

type Expiration = {
  since: DateTime.DateTime
  ttl: Duration.Duration
}

type StoredValue = Data.TaggedEnum<{
  String: { value: string; expiration?: Expiration }
  List: { value: TArray.TArray<string>; expiration?: Expiration }
  Set: { value: TSet.TSet<string>; expiration?: Expiration }
}>

const StoredValue = Data.taggedEnum<StoredValue>()

type Store = TMap.TMap<string, StoredValue>

class STMBackedInMemoryStore implements StorageImpl {
  private store: Store

  constructor(store: Store) {
    this.store = store
  }

  static make = Effect.gen(function*() {
    const tmap = yield* TMap.make<string, StoredValue>()
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
    const _ = Match.value(command).pipe(
      Match.when(Predicate.isTagged("GET"), (command) => this.GET(command)),
      Match.when(Predicate.isTagged("SET"), (command) => this.SET(command)),
      Match.exhaustive
    )
  }

  private GET(command: Commands.GET) {
    return STM.gen(this, function*() {
      const value = yield* TMap.get(this.store, command.key)
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
    return STM.fail(new StorageError({ message: "Not implemented" }))
  }
}

export const layer = Layer.effect(Storage, STMBackedInMemoryStore.make)
