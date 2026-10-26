---
"@tus/file-store": patch
---

Preserve completed uploads during expiration cleanup by checking the actual file size instead of the persisted metadata offset. Skip uploads that disappear during cleanup.
