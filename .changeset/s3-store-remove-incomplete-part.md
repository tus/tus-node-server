---
"@tus/s3-store": patch
---

Delete the incomplete part object (`<id>.part`) when removing an upload so terminating an upload that has a pending sub-minimum-size chunk no longer leaves an orphaned object in the bucket.
