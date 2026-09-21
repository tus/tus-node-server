---
"@tus/s3-store": patch
---

Stop reporting an upload as complete when listing its parts fails with a generic `NotFound`, which the AWS SDK assigns to any 404 without an S3 error code. Only `NoSuchUpload` and `NoSuchKey` indicate a finished multipart upload, as before 2.0.6.
