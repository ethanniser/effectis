## Goals

- protocol: RESP 2

- data structures: hash, list, set, sorted set, stream, bitmap
- commands: idk
- transactions, pubsub, ttl, LRU

log and flush peristence

- vanilla node reference implementation (does this actually need anything special to do concurrent transactions?)

---

- fix command doc response
- implement more commands

---

## NEW TODO

- [x] Get working with `redis-cli` / `npm:redis`
- [x] implement pub/sub
- [x] implement transactions
- [x] implement persistence (these dont have to be redis compatible for now)
  - [x] log persistence (untested)
  - [x] snapshot persistence (untested)
- [x] clean up error handling
- [ ] fix tests (transactions and pubsub)
- [x] perf comparison
- [ ] build out CLI
- [ ] implement remaining data structures / commands
  - [ ] string
  - [ ] hash
  - [ ] list
  - [ ] set

---

## Commands

### Basic

- [x] `SET`
  - [x] `SET key value`
  - [x] `SET key value EX seconds`
  - [x] `SET key value PX milliseconds`
  - [x] `SET key value NX`
  - [x] `SET key value XX`
  - [x] `SET key value EX seconds NX`
  - [x] `SET key value PX milliseconds NX`
  - [x] `SET key value EX seconds XX`
  - [x] `SET key value PX milliseconds XX`
- [x] `GET key`
- [x] `DEL`
  - [x] `DEL key`
  - [x] `DEL key1 key2 ... keyN`
- [x] `EXISTS`
  - [x] `EXISTS key`
  - [x] `EXISTS key1 key2 ... keyN`
- [ ] `EXPIRE`
  - [ ] `EXPIRE key seconds`
  - [ ] `EXPIRE key seconds NX`
  - [ ] `EXPIRE key seconds XX`
  - [ ] `EXPIRE key seconds GT`
  - [ ] `EXPIRE key seconds LT`
- [x] `TTL key`
- [x] `PERSIST key`
- [x] `TYPE key`

### String

- [ ] `APPEND key value`
- [ ] `INCR key`
- [ ] `DECR key`
- [ ] `INCRBY key increment`
- [ ] `DECRBY key decrement`
- [ ] `STRLEN key`

### List

- [ ] `LPUSH`
  - [ ] `LPUSH key value`
  - [ ] `LPUSH key value1 value2 ... valueN`
- [ ] `RPUSH`
  - [ ] `RPUSH key value`
  - [ ] `RPUSH key value1 value2 ... valueN`
- [ ] `LPOP`
  - [ ] `LPOP key`
  - [ ] `LPOP key count`
- [ ] `RPOP`
  - [ ] `RPOP key`
  - [ ] `RPOP key count`
- [ ] `LLEN key`
- [ ] `LRANGE`
  - [ ] `LRANGE key start stop`

### Hash

- [ ] `HSET`
  - [ ] `HSET key field value`
  - [ ] `HSET key field1 value1 field2 value2 ... fieldN valueN`
- [ ] `HGET key field`
- [ ] `HDEL`
  - [ ] `HDEL key field`
  - [ ] `HDEL key field1 field2 ... fieldN`
- [ ] `HEXISTS key field`
- [ ] `HGETALL key`

### Set

- [ ] `SADD`
  - [ ] `SADD key value`
  - [ ] `SADD key value1 value2 ... valueN`
- [ ] `SREM`
  - [ ] `SREM key value`
  - [ ] `SREM key value1 value2 ... valueN`
- [ ] `SMEMBERS key`
- [ ] `SCARD key`
- [ ] `SISMEMBER key value`

### Server

- [x] `PING`
- [x] `ECHO message`
- [x] `QUIT`
- [x] `FLUSHALL` (under 'storage' category)
- [ ] `COMMAND`
  - [ ] `COMMAND DOCS`
- [ ] `CLIENT`

### Execution

- [x] `MULTI`
- [x] `EXEC`
- [x] `DISCARD`
- [ ] `WATCH`
  - [ ] `WATCH key`
  - [ ] `WATCH key1 key2 ... keyN`
- [ ] `UNWATCH`

### PubSub

- [x] `PUBLISH channel message`
- [x] `SUBSCRIBE`
  - [x] `SUBSCRIBE channel`
  - [x] `SUBSCRIBE channel1 channel2 ... channelN`
- [x] `UNSUBSCRIBE`
  - [x] `UNSUBSCRIBE`
  - [x] `UNSUBSCRIBE channel`
  - [x] `UNSUBSCRIBE channel1 channel2 ... channelN`
