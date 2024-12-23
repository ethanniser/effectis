import * as SocketServer from "@effect/experimental/SocketServer"
import { Socket } from "@effect/platform"
import { Channel, Effect, pipe, Stream } from "effect"

export const main = Effect.gen(function*() {
  const server = yield* SocketServer.SocketServer
  yield* Effect.log("Server started", server.address)
  yield* server.run(handleConnection)
}).pipe(
  Effect.catchAll((e) => Effect.logError("Error", e))
)

const handleConnection = Effect.fn("handleConnection")(function*(socket: Socket.Socket) {
  yield* Effect.log("New connection")
  const channel = Socket.toChannel(socket)
  // @ts-expect-error
  const rawInputStream = Channel.toStream(channel) as Stream.Stream<Uint8Array>
  const rawOutputSink = Channel.toSink(channel)
  yield* pipe(
    rawInputStream,
    processStream,
    Stream.run(rawOutputSink)
  )
}, Effect.onExit(() => Effect.log("Connection closed")))

const processStream = (input: Stream.Stream<Uint8Array>) =>
  pipe(
    input,
    Stream.decodeText()
    // decode to message format
    // process message
    // encode to message format
  )
