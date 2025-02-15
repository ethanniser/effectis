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
} from "effect";

export class PubSubMessage extends Data.TaggedClass("PubSubMessage")<{
  channel: string;
  message: string;
}> {}

interface PubSubDriverImpl {
  subscribe: (
    channels: string[]
  ) => Effect.Effect<Stream.Stream<PubSubMessage>, never, Scope.Scope>;
}

export class PubSubDriver extends Context.Tag("PubSubDriver")<
  PubSubDriver,
  PubSubDriverImpl
>() {}

export const layer = Layer.effect(
  PubSubDriver,
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<PubSubMessage>();
    return PubSubDriver.of({
      subscribe: (channels) =>
        pipe(
          pubsub.subscribe,
          Effect.map(
            flow(
              Stream.fromQueue,
              Stream.filter(({ channel }) => channels.includes(channel))
            )
          )
        ),
    });
  })
);
