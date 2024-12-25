import type * as Command from "@effect/cli/Command"
import * as SocketServer from "@effect/experimental/SocketServer"
import { Socket } from "@effect/platform"
import { Channel, Effect, Either, identity, Option, pipe, Schema, Stream } from "effect"
import { RESP } from "./RESP.js"

export const main = Effect.gen(function*() {
  const server = yield* SocketServer.SocketServer
  yield* Effect.log("Server started", server.address)
  yield* server.run(handleConnection)
}).pipe(
  Effect.catchAll((e) => Effect.logError("Error", e))
)

const handleConnection = Effect.fn("handleConnection")(function*(socket: Socket.Socket) {
  yield* Effect.log("New connection")
  const channel = Socket.toChannel<never>(socket)
  const rawInputStream = Stream.never.pipe(
    Stream.pipeThroughChannel(channel)
  )
  const rawOutputSink = Channel.toSink(channel)
  yield* pipe(
    rawInputStream,
    decodeFromWireFormat,
    parseCommands,
    Stream.mapEffect(runCommand),
    encodeToWireFormat,
    Stream.run(rawOutputSink)
  )
}, Effect.onExit(() => Effect.log("Connection closed")))

const decodeFromWireFormat = (
  input: Stream.Stream<Uint8Array, Socket.SocketError>
): Stream.Stream<RESP.Value, unknown> =>
  pipe(
    input,
    Stream.decodeText(),
    Stream.mapAccumEffect("", (buffer, nextChunk) =>
      Effect.gen(function*() {
        const newBuffer = buffer + nextChunk
        const parseResult = yield* Schema.decode(RESP.ValueWireFormat)(newBuffer).pipe(Effect.either)
        if (Either.isRight(parseResult)) {
          return ["", Option.some(parseResult.right)]
        } else {
          return [newBuffer, Option.none()]
        }
      })),
    Stream.filterMap(identity)
  )

interface Command {}

declare const parseCommands: (input: Stream.Stream<RESP.Value, unknown>) => Stream.Stream<Command, unknown>
declare const runCommand: (input: Command) => Effect.Effect<RESP.Value, unknown>
const encodeToWireFormat = (input: Stream.Stream<RESP.Value, unknown>): Stream.Stream<Uint8Array, unknown> =>
  pipe(
    input,
    Stream.mapEffect((respValue) => Schema.encode(RESP.ValueWireFormat)(respValue)),
    Stream.encodeText
  )
