import {
  Context,
  Effect,
  Stream,
  PubSub,
  Data,
  Scope,
  Layer,
  pipe,
  flow,
  FiberRef,
  HashSet,
  Queue,
  HashMap,
  Ref,
  Option,
} from "effect";

export class PubSubMessage extends Data.TaggedClass("PubSubMessage")<{
  channel: string;
  message: string;
}> {}

interface PubSubDriverImpl {
  subscribe: (
    channels: ReadonlyArray<string>
  ) => Effect.Effect<Stream.Stream<PubSubMessage>, never, Scope.Scope>;
  publish: Queue.Enqueue<PubSubMessage>;
  nSubscribers: (channel: string) => Effect.Effect<number>;
}

export class PubSubDriver extends Context.Tag("PubSubDriver")<
  PubSubDriver,
  PubSubDriverImpl
>() {}

export const currentlySubscribedChannelsFiberRef = FiberRef.unsafeMake<
  HashSet.HashSet<string>
>(HashSet.empty());

export const layer = Layer.effect(
  PubSubDriver,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<PubSubMessage>();
    const channelSubscriberCount = yield* Ref.make(
      HashMap.empty<string, number>()
    );
    return PubSubDriver.of({
      publish: pubsub,
      nSubscribers: (channel) =>
        Effect.gen(function* () {
          const count = yield* Ref.get(channelSubscriberCount).pipe(
            Effect.map((map) => HashMap.get(map, channel))
          );
          return Option.getOrElse(count, () => 0);
        }),
      subscribe: (channels) =>
        Effect.gen(function* () {
          for (const channel of channels) {
            yield* Ref.update(channelSubscriberCount, (map) =>
              HashMap.set(
                map,
                channel,
                Option.getOrElse(HashMap.get(map, channel), () => 0) + 1
              )
            );
          }

          yield* Effect.addFinalizer(() =>
            Effect.gen(function* () {
              for (const channel of channels) {
                yield* Ref.update(channelSubscriberCount, (map) =>
                  HashMap.set(
                    map,
                    channel,
                    Option.getOrElse(HashMap.get(map, channel), () => 1) - 1 // default is 1 so we dont decrement below 0
                  )
                );
              }
            })
          );

          const subscription = yield* pubsub.subscribe;
          return subscription.pipe(
            Stream.fromQueue,
            Stream.filterEffect(({ channel }) =>
              Effect.gen(function* () {
                const currentlySubscribedChannels = yield* FiberRef.get(
                  currentlySubscribedChannelsFiberRef
                );
                return HashSet.has(currentlySubscribedChannels, channel);
              })
            )
          );
        }),
    });
  })
);
