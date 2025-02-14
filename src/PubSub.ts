import {
  Context,
  FiberRef,
  Effect,
  HashSet,
  Stream,
  PubSub,
  Data,
  Queue,
  Scope,
  Layer,
  pipe,
} from "effect";
import { Command } from "./Command.js";

class PubSubMessage extends Data.TaggedClass("PubSubMessage")<{
  channel: string;
  message: string;
}> {}

interface PubSubDriverImpl {
  subscribe: (channels: string[]) => Stream.Stream<PubSubMessage>;
}

class PubSubDriver extends Context.Tag("PubSubDriver")<
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
          Effect.map(Stream.fromQueue),
          Stream.unwrapScoped,
          Stream.filter(({ channel }) => channels.includes(channel))
        ),
    });
  })
);
