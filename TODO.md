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

## Commands

### Basic

- [ ] `SET`
  - [x] `SET key value`
  - [ ] `SET key value EX seconds`
  - [ ] `SET key value PX milliseconds`
  - [ ] `SET key value NX`
  - [ ] `SET key value XX`
  - [ ] `SET key value EX seconds NX`
  - [ ] `SET key value PX milliseconds NX`
  - [ ] `SET key value EX seconds XX`
  - [ ] `SET key value PX milliseconds XX`
- [x] `GET key`
- [ ] `DEL`
  - [ ] `DEL key`
  - [ ] `DEL key1 key2 ... keyN`
- [ ] `EXISTS`
  - [ ] `EXISTS key`
  - [ ] `EXISTS key1 key2 ... keyN`
- [ ] `EXPIRE`
  - [ ] `EXPIRE key seconds`
  - [ ] `EXPIRE key seconds NX`
  - [ ] `EXPIRE key seconds XX`
  - [ ] `EXPIRE key seconds GT`
  - [ ] `EXPIRE key seconds LT`
- [ ] `TTL key`
- [ ] `PERSIST key`
- [ ] `TYPE key`

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

- [ ] `PING`
  - [ ] `PING`
  - [ ] `PING message`
- [ ] `ECHO message`
- [ ] `FLUSHALL`
  - [ ] `FLUSHALL`
  - [ ] `FLUSHALL ASYNC`
- [ ] `COMMAND`
  - [ ] `COMMAND DOCS`
- [ ] `QUIT`
- [ ] `CLIENT`
- [ ] `INFO`

### Execution

- [ ] `MULTI`
- [ ] `EXEC`
- [ ] `DISCARD`
- [ ] `WATCH`
  - [ ] `WATCH key`
  - [ ] `WATCH key1 key2 ... keyN`
- [ ] `UNWATCH`

### Messaging

- [ ] `PUBLISH channel message`
- [ ] `SUBSCRIBE`
  - [ ] `SUBSCRIBE channel`
  - [ ] `SUBSCRIBE channel1 channel2 ... channelN`
- [ ] `UNSUBSCRIBE`
  - [ ] `UNSUBSCRIBE`
  - [ ] `UNSUBSCRIBE channel`
  - [ ] `UNSUBSCRIBE channel1 channel2 ... channelN`
