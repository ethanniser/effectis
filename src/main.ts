import * as SocketServer from "@effect/experimental/SocketServer"
import { Socket } from "@effect/platform"
import { Channel, Effect, Either, identity, Option, pipe, Schema, Stream } from "effect"
import { type Command, CommandFromRESP } from "./Command.js"
import { RESP } from "./RESP.js"
import { Storage } from "./Storage.js"

type RedisEffectError = unknown
type RedisServices = Storage

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
    processRESP,
    encodeToWireFormat,
    Stream.run(rawOutputSink)
  )
}, Effect.onExit(() => Effect.log("Connection closed")))

export const processRESP = (
  input: Stream.Stream<RESP.Value, RedisEffectError, RedisServices>
): Stream.Stream<RESP.Value, RedisEffectError, RedisServices> =>
  pipe(
    input,
    parseCommands,
    Stream.mapEffect(runCommand)
  )

const decodeFromWireFormat = (
  input: Stream.Stream<Uint8Array, Socket.SocketError, RedisServices>
): Stream.Stream<RESP.Value, RedisEffectError, RedisServices> =>
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

const parseCommands = (
  input: Stream.Stream<RESP.Value, RedisEffectError, RedisServices>
): Stream.Stream<Command, RedisEffectError, RedisServices> =>
  pipe(
    input,
    Stream.mapEffect((value) => Schema.decode(CommandFromRESP)(value))
  )

const runCommand = (input: Command): Effect.Effect<RESP.Value, RedisEffectError, RedisServices> =>
  Effect.gen(function*() {
    const storage = yield* Storage
    const result = yield* storage.run(input)
    return result
  })

const encodeToWireFormat = (
  input: Stream.Stream<RESP.Value, RedisEffectError, RedisServices>
): Stream.Stream<Uint8Array, RedisEffectError, RedisServices> =>
  pipe(
    input,
    Stream.mapEffect((respValue) => Schema.encode(RESP.ValueWireFormat)(respValue)),
    Stream.encodeText
  )
