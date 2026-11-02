---
"@tus/s3-store": patch
---

Update cached metadata after declaring a deferred upload length so uploads can finish with caches that return copies such as RedisKvStore, IoRedisKvStore and FileKvStore.
`remove` now awaits cache eviction so a failing cache rejects the termination instead of causing an unhandled rejection.
Expiration cleanup also evicts cached metadata. When a multipart upload is missing, verify that the final object exists and matches the declared size before reporting completion, so aborted uploads are not mistaken for completed uploads.
Missing cache entries are tolerated during S3 expiration cleanup.
