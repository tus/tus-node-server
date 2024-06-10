---
'@tus/file-store': minor
'@tus/gcs-store': minor
'@tus/s3-store': minor
'@tus/utils': minor
---

Add basic storage information to the Upload model. You can now access `upload.storage`
which has `type` (`file`, `s3`, `gcs`), `path`, and when applicable `bucket`.
