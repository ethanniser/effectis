import { NodeContext } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import {
  Chunk,
  Effect,
  Layer,
  pipe,
  Schema,
  Stream,
  Option,
  Logger,
  LogLevel,
} from "effect";
import { CommandFromRESP, Commands } from "../src/Command.js";
import { processRESP } from "../src/main.js";
import { RESP } from "../src/RESP.js";
import * as STMBackedInMemory from "../src/Storage/STMBackedInMemory.js";
import * as PubSub from "../src/PubSub.js";
import * as TransactionDriver from "../src/Transaction.js";

const TestServices = Layer.mergeAll(
  STMBackedInMemory.layer(),
  NodeContext.layer,
  PubSub.layer,
  TransactionDriver.layer
);

const runInput = (input: RESP.Value) =>
  pipe(Stream.make(input), processRESP, Stream.runCollect);

// ! IS THE EVEN NECESSARY? OVER JUST E2E?
// todo: probably need to run in a transaction (theoretically they could interfere with each other)
describe("Storage", () => {
  it.effect("SET", () =>
    Effect.gen(function* () {
      const result = yield* pipe(
        new Commands.SET({
          key: "key",
          value: "value",
          expiration: Option.none(),
          mode: Option.none(),
        }),
        Schema.encode(CommandFromRESP),
        Effect.andThen(runInput)
      );
      expect(result).toEqual(
        Chunk.make(new RESP.SimpleString({ value: "OK" }))
      );
    }).pipe(Effect.provide(TestServices))
  );
  it.effect("SET and GET", () =>
    Effect.gen(function* () {
      yield* pipe(
        new Commands.SET({
          key: "key",
          value: "value",
          expiration: Option.none(),
          mode: Option.none(),
        }),
        Schema.encode(CommandFromRESP),
        Effect.andThen(runInput)
      );

      const result = yield* pipe(
        new Commands.GET({ key: "key" }),
        Schema.encode(CommandFromRESP),
        Effect.andThen(runInput)
      );
      expect(result).toEqual(
        Chunk.make(new RESP.BulkString({ value: "value" }))
      );
    }).pipe(Effect.provide(TestServices))
  );
  it.effect("DEL", () =>
    Effect.gen(function* () {
      yield* pipe(
        new Commands.SET({
          key: "key",
          value: "value",
          expiration: Option.none(),
          mode: Option.none(),
        }),
        Schema.encode(CommandFromRESP),
        Effect.andThen(runInput)
      );
      yield* pipe(
        new Commands.SET({
          key: "key2",
          value: "value2",
          expiration: Option.none(),
          mode: Option.none(),
        }),
        Schema.encode(CommandFromRESP),
        Effect.andThen(runInput)
      );

      const result = yield* pipe(
        new Commands.DEL({ keys: ["key", "key2"] }),
        Schema.encode(CommandFromRESP),
        Effect.andThen(runInput)
      );
      expect(result).toEqual(
        Chunk.make(new RESP.SimpleString({ value: "OK" }))
      );
    }).pipe(Effect.provide(TestServices))
  );
  it.effect("EXISTS", () =>
    Effect.gen(function* () {
      yield* pipe(
        new Commands.SET({
          key: "key",
          value: "value",
          expiration: Option.none(),
          mode: Option.none(),
        }),
        Schema.encode(CommandFromRESP),
        Effect.andThen(runInput)
      );
      yield* pipe(
        new Commands.SET({
          key: "key2",
          value: "value2",
          expiration: Option.none(),
          mode: Option.none(),
        }),
        Schema.encode(CommandFromRESP),
        Effect.andThen(runInput)
      );

      const result = yield* pipe(
        new Commands.EXISTS({ keys: ["key", "key2"] }),
        Schema.encode(CommandFromRESP),
        Effect.andThen(runInput)
      );
      expect(result).toEqual(Chunk.make(new RESP.Integer({ value: 2 })));
    }).pipe(Effect.provide(TestServices))
  );
});
