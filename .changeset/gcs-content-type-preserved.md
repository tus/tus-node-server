---
"@tus/gcs-store": patch
---

Preserve the explicit `contentType` from upload metadata when a write at offset 0 replaces the GCS object, including empty writes.
