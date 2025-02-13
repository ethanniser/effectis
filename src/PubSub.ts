import { Context, FiberRef, Effect, HashSet } from "effect";

const currentlySubscribedChannelsFiberRef = FiberRef.unsafeMake<
  HashSet.HashSet<string>
>(HashSet.empty());
