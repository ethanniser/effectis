import type { DateTime, Duration, TArray, TMap, TPubSub, TSet } from "effect"
import { Data, Effect, STM } from "effect"

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

type Expiration = {
  since: DateTime.DateTime
  ttl: Duration.Duration
}

type StoredValue = Data.TaggedEnum<{
  String: { value: string; expiration?: Expiration }
  List: { value: TArray.TArray<string>; expiration?: Expiration }
  Set: { value: TSet.TSet<string>; expiration?: Expiration }
  Channel: { value: TPubSub.TPubSub<string> }
}>

const StoredValue = Data.taggedEnum<StoredValue>()

type Store = TMap.TMap<string, StoredValue>
