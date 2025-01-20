---
"@tus/s3-store": patch
---

Fix zero byte files only storing a .info file. Now correctly stores an empty file.
