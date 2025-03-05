// @ts-nocheck

import * as SocketServer from "@effect/experimental/SocketServer";
import { Socket } from "@effect/platform";

// main: Effect<void, SocketServerError, SocketServer>
export const main = Effect.gen(function* () {
  const server = yield* SocketServer.SocketServer;
  yield* server.run(handleConnection);
});

declare const handleConnection: (socket: Socket.Socket) => Effect.Effect<void>;

import * as NodeSocketServer from "@effect/experimental/SocketServer/Node";
import { Duplex, Readable } from "node:stream";
main.pipe(Effect.provide(NodeSocketServer.layer({ port: 6379 })));
main.pipe(Effect.provide(NodeSocketServer.layerWebSocket({ port: 1234 })));

//

const handleConnection = (socket: Socket.Socket) =>
  Effect.gen(function* () {
    const channel = Socket.toChannel(socket);
  });

// channel ~= Channel<Uint8Array, Uint8Array | string | CloseEvent, SocketError>

import * as NodeStream from "node:stream";

type Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env> =
  NodeStream.Duplex;
type Stream<Out, Err, Env> = NodeStream.Readable;
type Sink<Out, In, Leftover, Err, Env> = NodeStream.Writable;

//

declare function decodeFromWireFormat(
  input: Stream<Uint8Array>
): Stream<RESP.Value>;

declare function parseToCommands(input: Stream<RESP.Value>): Stream<Command>;

declare function handleCommand(input: Stream<Command>): Stream<RESP.Value>;

declare function encodeToWireFormat(
  input: Stream<RESP.Value>
): Stream<Uint8Array>;

// processStream: (input: Stream<Uint8Array>) => Stream<Uint8Array>
const processStream = flow(
  decodeFromWireFormat,
  parseToCommands,
  handleCommand,
  encodeToWireFormat
);

//

const input = "+OK\r\n-ERR\r\n";
const output = [
  {
    _tag: "SimpleString",
    value: "OK",
  },
  {
    _tag: "Error",
    value: "ERR",
  },
];

//
