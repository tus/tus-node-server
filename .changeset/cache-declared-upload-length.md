---
"@tus/s3-store": patch
---

Update cached metadata after declaring a deferred upload length so uploads can finish with caches that return copies such as RedisKvStore, IoRedisKvStore and FileKvStore.
`remove` now awaits cache eviction so a failing cache rejects the termination instead of causing an unhandled rejection.
