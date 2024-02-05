---
'@tus/s3-store': minor
---

Introduce backpressure to avoid writing more temporary files to disk than we can upload & fix offset calculation by downloading the incomplete part first
