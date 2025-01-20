---
"@tus/s3-store": patch
---

Add `minPartSize` option. This can be used alongside `partSize` to guarantee that all non-trailing parts are _exactly_ the same size, which is required for Cloudflare R2.
