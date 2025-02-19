# Effect CLI Application Template

This template provides a solid foundation for building scalable and maintainable command-line applications with Effect.

## Running Code

This template leverages [tsx](https://tsx.is) to allow execution of TypeScript files via NodeJS as if they were written in plain JavaScript.

To execute a file with `tsx`:

```sh
pnpm tsx ./path/to/the/file.ts
```

## Operations

**Building**

To build the package:

```sh
pnpm build
```

**Testing**

To test the package:

```sh
pnpm test
```

### _Very_ Crude Benchmarks

_Taken from remote vps (33ms ping), 2vCPU, 2GB RAM_

Redis

```
redis-benchmark -t set,get, -n 1000 -q
SET: 1585.54 requests per second, p50=31.103 msec
GET: 1583.28 requests per second, p50=31.135 msec
```

Effectis - Original Parser (Node)

```
redis-benchmark -t set,get, -n 1000 -q
SET: 238.21 requests per second, p50=144.895 msec
GET: 315.76 requests per second, p50=107.199 msec
```

Effectis - Original Parser(Bun)

```
redis-benchmark -t set,get, -n 1000 -q
SET: 245.70 requests per second, p50=125.247 msec
GET: 357.78 requests per second, p50=87.103 msec
```

Effectis - Fast Parser (Bun)

```
redis-benchmark -p 1002 -t set,get, -n 5000 -q
SET: 493.19 requests per second, p50=88.767 msec
GET: 807.49 requests per second, p50=51.487 msec
```

[Bare minimum node implementation](https://github.com/ashwaniYDV/redis-server-clone-js)

- Only 120 lines of code (effectis is 3000)
- only supports get and set
- no pub/sub
- no persistence
- no transactions

```
redis-benchmark -t set,get, -n 1000 -q
SET: 1470.59 requests per second, p50=30.975 msec
GET: 1479.29 requests per second, p50=31.023 msec
```
