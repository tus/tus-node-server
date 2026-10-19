---
"@tus/utils": patch
---

Fix `FileKvStore.list()` missing or mispairing uploads whose ids share a prefix (e.g. `id` and `id.j`).
