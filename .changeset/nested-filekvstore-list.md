---
"@tus/utils": patch
---

Fix `FileKvStore.list()` to include nested upload IDs. Expiration cleanup now removes existing nested uploads that meet the expiration rules, which were previously skipped.
