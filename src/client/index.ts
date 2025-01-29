import { Context, Data, Effect, Layer } from "effect"
import { createClient } from "redis"

export class RedisError extends Data.TaggedError("RedisError")<{
  cause: unknown
}> {}

interface RedisImpl {
  use: <T>(fn: (client: ReturnType<typeof createClient>) => T) => Effect.Effect<Awaited<T>, RedisError, never>
}
export class Redis extends Context.Tag("Redis")<Redis, RedisImpl>() {}

export const layer = (options?: Parameters<typeof createClient>[0]) =>
  Layer.effect(
    Redis,
    Effect.gen(function*() {
      const client = yield* Effect.tryPromise(() => createClient(options).connect())
      return {
        use: (fn) =>
          Effect.gen(function*() {
            const result = yield* Effect.try({
              try: () => fn(client),
              catch: (e) => Effect.fail(new RedisError({ cause: e }))
            })
            if (result instanceof Promise) {
              return yield* Effect.tryPromise({
                try: () => result,
                catch: (e) => Effect.fail(new RedisError({ cause: e }))
              })
            } else {
              return result
            }
          }) as any // should be fine
      }
    })
  )
