import type { RedisError, RedisServices } from "../main.js";
import { RESP } from "../RESP.js";
import { Socket } from "@effect/platform";
import { NodeStream } from "@effect/platform-node";
import { Data, pipe, Stream } from "effect";
import { Duplex, DuplexOptions } from "node:stream";
import RedisParser from "redis-parser";

/**
 * Options for the RedisParserStream
 */
interface RedisParserStreamOptions extends DuplexOptions {
  returnBuffers?: boolean;
  stringNumbers?: boolean;
}

/**
 * A Node.js Duplex stream that parses Redis protocol responses.
 */
class RedisParserStream extends Duplex {
  private parser: RedisParser;

  constructor(options: RedisParserStreamOptions = {}) {
    super({ ...options, readableObjectMode: true }); // Output parsed data as objects

    this.parser = new RedisParser({
      returnReply: (reply: any) => this.push(reply), // Push parsed data downstream
      returnError: (error: Error) => this.emit("error", error), // Emit errors
      returnBuffers: options.returnBuffers || false,
      stringNumbers: options.stringNumbers || false,
    });
  }

  /**
   * Processes incoming Redis protocol responses.
   * @param chunk Incoming buffer chunk from the stream.
   * @param encoding Encoding of the chunk (ignored since Redis uses binary buffers).
   * @param callback Callback function to signal completion.
   */
  _write(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    try {
      this.parser.execute(chunk);
      callback();
    } catch (err) {
      callback(err as Error);
    }
  }

  /**
   * Readable stream implementation (unused since data is pushed from `returnReply`).
   */
  _read(): void {
    // No-op, since data is pushed asynchronously from the parser
  }

  /**
   * Finalizes the stream when no more data is written.
   * @param callback Callback function to signal completion.
   */
  _final(callback: (error?: Error | null) => void): void {
    this.push(null); // Signal end of stream
    callback();
  }
}

export class FastParserError extends Data.TaggedError("FastParserError")<{
  cause?: unknown;
}> {}

type RedisParserOutput = string | number | null | RedisParserOutput[];

function toRESP(value: RedisParserOutput): RESP.Value {
  if (typeof value === "string") {
    return new RESP.BulkString({ value });
  } else if (typeof value === "number") {
    return new RESP.Integer({ value });
  } else if (value === null) {
    return new RESP.BulkString({ value: "null" });
  } else if (Array.isArray(value)) {
    return new RESP.Array({ value: value.map(toRESP) });
  } else {
    throw new Error("Invalid RedisParserOutput");
  }
}

export function decodeFromWireFormatFast(
  input: Stream.Stream<Uint8Array, Socket.SocketError, RedisServices>
): Stream.Stream<RESP.Value, RedisError, RedisServices> {
  return pipe(
    input,
    Stream.map((bytes) => Buffer.copyBytesFrom(bytes)),
    Stream.pipeThroughChannel(
      NodeStream.fromDuplex<RedisError, RedisError, Buffer, RedisParserOutput>(
        () => new RedisParserStream(),
        (e) => new FastParserError({ cause: e })
      )
    ),
    Stream.map(toRESP)
  );
}
