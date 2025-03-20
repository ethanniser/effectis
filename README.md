# Effectis - A Reimplementation of Redis in [Effect](https://effect.website)

This project was presented as part of a talk for Effect Days 2025.

## Benchmarks

See `scripts/benchmark.ts` (a bit broken but you can see how to run yourself)

Manually taken:

### Redis (Reference)

```
redis-benchmark -t set,get -n 5000 -q
SET: 96153.84 requests per second, p50=0.423 msec
GET: 217391.30 requests per second, p50=0.119 msec
```

Average RPS: 156772.57

### [Bare minimum JS/Node implementation](https://github.com/ashwaniYDV/redis-server-clone-js)

- Only 120 lines of code (effectis is 3000)
- only supports get and set
- no pub/sub
- no persistence
- no transactions

```
redis-benchmark -t set,get -n 5000 -q -p 3000
SET: 98039.22 requests per second, p50=0.407 msec
GET: 172413.80 requests per second, p50=0.239 msec
```

Average RPS: 135226.51

### Effectis (node) (original parser)

```
redis-benchmark -t set,get -n 5000 -q
SET: 1075.27 requests per second, p50=42.527 msec
GET: 1452.64 requests per second, p50=32.143 msec
```

Average RPS: 1263.96

### Effectis (bun) (original parser)

```
redis-benchmark -t set,get -n 5000 -q
SET: 1529.05 requests per second, p50=32.127 msec
GET: 1956.95 requests per second, p50=24.495 msec
```

Average RPS: 1743.00

### Effectis (node) (improved parser)

```
redis-benchmark -t set,get -n 5000 -q
SET: 2702.70 requests per second, p50=16.231 msec
GET: 4397.54 requests per second, p50=10.495 msec
```

Average RPS: 3550.12

### Effectis (bun) (improved parser)

```
redis-benchmark -t set,get -n 5000 -q
SET: 3610.11 requests per second, p50=13.599 msec
GET: 4366.81 requests per second, p50=10.415 msec
```

Average RPS: 3988.46
