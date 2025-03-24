---
"@tus/azure-store": major
"@tus/file-store": major
"@tus/gcs-store": major
"@tus/s3-store": major
"@tus/server": major
"@tus/utils": minor
---

Make this package ESM-only instead of CommonJS. Since Node.js >= 20.19.0 you can `require(esm)` so you can consume this package even if you don't ESM yourself yet.
