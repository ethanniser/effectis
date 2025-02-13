import { describe, expect, it } from "@effect/vitest";
import { Effect, Either, Schema } from "effect";
import { RESP } from "../src/RESP.js";

describe("RESP Parser", () => {
  it.effect("should parse simple string", () =>
    Effect.gen(function* () {
      const input = "+OK\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(new RESP.SimpleString({ value: "OK" }));
    })
  );

  it.effect("should parse error", () =>
    Effect.gen(function* () {
      const input = "-ERR\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(new RESP.Error({ value: "ERR" }));
    })
  );

  it.effect("should parse integer", () =>
    Effect.gen(function* () {
      const input = ":1\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(new RESP.Integer({ value: 1 }));
    })
  );

  it.effect("should parse bulk string", () =>
    Effect.gen(function* () {
      const input = "$5\r\nHello\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(new RESP.BulkString({ value: "Hello" }));
    })
  );

  it.effect("should parse null bulk string", () =>
    Effect.gen(function* () {
      const input = "$-1\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(new RESP.BulkString({ value: null }));
    })
  );

  it.effect("should parse empty array", () =>
    Effect.gen(function* () {
      const input = "*0\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(new RESP.Array({ value: [] }));
    })
  );

  it.effect("should parse null array", () =>
    Effect.gen(function* () {
      const input = "*-1\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(new RESP.Array({ value: null }));
    })
  );

  it.effect("should parse just int array", () =>
    Effect.gen(function* () {
      const input = "*3\r\n:1\r\n:2\r\n:3\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(
        new RESP.Array({
          value: [
            new RESP.Integer({ value: 1 }),
            new RESP.Integer({ value: 2 }),
            new RESP.Integer({ value: 3 }),
          ],
        })
      );
    })
  );

  it.effect("should parse simple array", () =>
    Effect.gen(function* () {
      const input = "*4\r\n:1\r\n+OK\r\n-ERR\r\n$5\r\nHello\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(
        new RESP.Array({
          value: [
            new RESP.Integer({ value: 1 }),
            new RESP.SimpleString({ value: "OK" }),
            new RESP.Error({ value: "ERR" }),
            new RESP.BulkString({ value: "Hello" }),
          ],
        })
      );
    })
  );

  it.effect("should parse nested array", () =>
    Effect.gen(function* () {
      const input = "*3\r\n*2\r\n:1\r\n:2\r\n*2\r\n:3\r\n:4\r\n+HI\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(
        new RESP.Array({
          value: [
            new RESP.Array({
              value: [
                new RESP.Integer({ value: 1 }),
                new RESP.Integer({ value: 2 }),
              ],
            }),
            new RESP.Array({
              value: [
                new RESP.Integer({ value: 3 }),
                new RESP.Integer({ value: 4 }),
              ],
            }),
            new RESP.SimpleString({ value: "HI" }),
          ],
        })
      );
    })
  );

  it.effect("should parse a bulk string with a multi digit length", () =>
    Effect.gen(function* () {
      const input = "$12\r\n123456789012\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(new RESP.BulkString({ value: "123456789012" }));
    })
  );

  it.effect("should parse an array with a multi digit length", () =>
    Effect.gen(function* () {
      const input =
        "*12\r\n:1\r\n:2\r\n:3\r\n:4\r\n:5\r\n:6\r\n:7\r\n:8\r\n:9\r\n:10\r\n:11\r\n:12\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(
        new RESP.Array({
          value: [
            new RESP.Integer({ value: 1 }),
            new RESP.Integer({ value: 2 }),
            new RESP.Integer({ value: 3 }),
            new RESP.Integer({ value: 4 }),
            new RESP.Integer({ value: 5 }),
            new RESP.Integer({ value: 6 }),
            new RESP.Integer({ value: 7 }),
            new RESP.Integer({ value: 8 }),
            new RESP.Integer({ value: 9 }),
            new RESP.Integer({ value: 10 }),
            new RESP.Integer({ value: 11 }),
            new RESP.Integer({ value: 12 }),
          ],
        })
      );
    })
  );

  it.effect("should parse a nested array with a multi digit length", () =>
    Effect.gen(function* () {
      const input =
        "*13\r\n:1\r\n:2\r\n:3\r\n:4\r\n:5\r\n:6\r\n:7\r\n:8\r\n:9\r\n:10\r\n:11\r\n:12\r\n*12\r\n:1\r\n:2\r\n:3\r\n:4\r\n:5\r\n:6\r\n:7\r\n:8\r\n:9\r\n:10\r\n:11\r\n:12\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input);
      expect(parsed).toEqual(
        new RESP.Array({
          value: [
            new RESP.Integer({ value: 1 }),
            new RESP.Integer({ value: 2 }),
            new RESP.Integer({ value: 3 }),
            new RESP.Integer({ value: 4 }),
            new RESP.Integer({ value: 5 }),
            new RESP.Integer({ value: 6 }),
            new RESP.Integer({ value: 7 }),
            new RESP.Integer({ value: 8 }),
            new RESP.Integer({ value: 9 }),
            new RESP.Integer({ value: 10 }),
            new RESP.Integer({ value: 11 }),
            new RESP.Integer({ value: 12 }),
            new RESP.Array({
              value: [
                new RESP.Integer({ value: 1 }),
                new RESP.Integer({ value: 2 }),
                new RESP.Integer({ value: 3 }),
                new RESP.Integer({ value: 4 }),
                new RESP.Integer({ value: 5 }),
                new RESP.Integer({ value: 6 }),
                new RESP.Integer({ value: 7 }),
                new RESP.Integer({ value: 8 }),
                new RESP.Integer({ value: 9 }),
                new RESP.Integer({ value: 10 }),
                new RESP.Integer({ value: 11 }),
                new RESP.Integer({ value: 12 }),
              ],
            }),
          ],
        })
      );
    })
  );

  it.effect(
    "should fail when a bulk string has a negative length (thats not -1)",
    () =>
      Effect.gen(function* () {
        const input = "$-3\r\nHello\r\n";
        const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input).pipe(
          Effect.either
        );
        expect(Either.isLeft(parsed)).toBe(true);
      })
  );

  it.effect(
    "should fail when an array has a negative length (thats not -1)",
    () =>
      Effect.gen(function* () {
        const input = "*-2\r\n:1\r\n";
        const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input).pipe(
          Effect.either
        );
        expect(Either.isLeft(parsed)).toBe(true);
      })
  );

  it.effect("should fail when a bulk string has the wrong length", () =>
    Effect.gen(function* () {
      const input = "$3\r\nHello\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input).pipe(
        Effect.either
      );
      expect(Either.isLeft(parsed)).toBe(true);
    })
  );

  it.effect("should fail when an array has the wrong length", () =>
    Effect.gen(function* () {
      const input = "*3\r\n:1\r\n";
      const parsed = yield* Schema.decode(RESP.ValueWireFormat)(input).pipe(
        Effect.either
      );
      expect(Either.isLeft(parsed)).toBe(true);
    })
  );
});

describe("RESP Encoder", () => {
  it.effect("should encode simple string", () =>
    Effect.gen(function* () {
      const input = new RESP.SimpleString({ value: "OK" });
      const encoded = yield* Schema.encode(RESP.ValueWireFormat)(input);
      expect(encoded).toEqual("+OK\r\n");
    })
  );

  it.effect("should encode error", () =>
    Effect.gen(function* () {
      const input = new RESP.Error({ value: "ERR" });
      const encoded = yield* Schema.encode(RESP.ValueWireFormat)(input);
      expect(encoded).toEqual("-ERR\r\n");
    })
  );

  it.effect("should encode integer", () =>
    Effect.gen(function* () {
      const input = new RESP.Integer({ value: 1 });
      const encoded = yield* Schema.encode(RESP.ValueWireFormat)(input);
      expect(encoded).toEqual(":1\r\n");
    })
  );

  it.effect("should encode bulk string", () =>
    Effect.gen(function* () {
      const input = new RESP.BulkString({ value: "Hello" });
      const encoded = yield* Schema.encode(RESP.ValueWireFormat)(input);
      expect(encoded).toEqual("$5\r\nHello\r\n");
    })
  );

  it.effect("should encode null bulk string", () =>
    Effect.gen(function* () {
      const input = new RESP.BulkString({ value: null });
      const encoded = yield* Schema.encode(RESP.ValueWireFormat)(input);
      expect(encoded).toEqual("$-1\r\n");
    })
  );

  it.effect("should encode empty array", () =>
    Effect.gen(function* () {
      const input = new RESP.Array({ value: [] });
      const encoded = yield* Schema.encode(RESP.ValueWireFormat)(input);
      expect(encoded).toEqual("*0\r\n");
    })
  );

  it.effect("should encode null array", () =>
    Effect.gen(function* () {
      const input = new RESP.Array({ value: null });
      const encoded = yield* Schema.encode(RESP.ValueWireFormat)(input);
      expect(encoded).toEqual("*-1\r\n");
    })
  );

  it.effect("should encode basic array", () =>
    Effect.gen(function* () {
      const input = new RESP.Array({
        value: [
          new RESP.Integer({ value: 1 }),
          new RESP.Integer({ value: 2 }),
          new RESP.Integer({ value: 3 }),
        ],
      });
      const encoded = yield* Schema.encode(RESP.ValueWireFormat)(input);
      expect(encoded).toEqual("*3\r\n:1\r\n:2\r\n:3\r\n");
    })
  );

  it.effect("should encode simple array", () =>
    Effect.gen(function* () {
      const input = new RESP.Array({
        value: [
          new RESP.Integer({ value: 1 }),
          new RESP.SimpleString({ value: "OK" }),
          new RESP.Error({ value: "ERR" }),
          new RESP.BulkString({ value: "Hello" }),
        ],
      });
      const encoded = yield* Schema.encode(RESP.ValueWireFormat)(input);
      expect(encoded).toEqual("*4\r\n:1\r\n+OK\r\n-ERR\r\n$5\r\nHello\r\n");
    })
  );

  it.effect("should encode nested array", () =>
    Effect.gen(function* () {
      const input = new RESP.Array({
        value: [
          new RESP.Array({
            value: [
              new RESP.Integer({ value: 1 }),
              new RESP.Integer({ value: 2 }),
            ],
          }),
          new RESP.Array({
            value: [
              new RESP.Integer({ value: 3 }),
              new RESP.Integer({ value: 4 }),
            ],
          }),
          new RESP.SimpleString({ value: "HI" }),
        ],
      });
      const encoded = yield* Schema.encode(RESP.ValueWireFormat)(input);
      expect(encoded).toEqual(
        "*3\r\n*2\r\n:1\r\n:2\r\n*2\r\n:3\r\n:4\r\n+HI\r\n"
      );
    })
  );
});
