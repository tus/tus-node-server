---
"@tus/s3-store": minor
---

Forward the `contentEncoding` upload metadata to S3 as `Content-Encoding` when creating the multipart upload, matching `contentType` and `cacheControl`.
