---
"@tus/s3-store": patch
---

Fix unhandled promise rejection when uploading a part fails, in which case we returned too early, leaving other parts running in the background.
