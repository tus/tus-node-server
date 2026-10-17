---
"@tus/s3-store": patch
---

Complete empty multipart uploads in `create` when `Upload-Length` is 0 so the object exists before `onUploadFinish` runs.
