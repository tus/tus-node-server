---
"@tus/s3-store": patch
---

Close temporary part file readers after S3 uploads succeed or fail, and remove the downloaded incomplete part when deleting it from S3 fails, preventing file descriptor and disk space leaks.
