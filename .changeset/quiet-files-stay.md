---
"@tus/server": patch
"@tus/file-store": patch
"@tus/utils": patch
---

Reject encoded path separators and NUL bytes in default upload IDs, and prevent file store paths from escaping their configured directory. Applications using nested IDs must provide a custom `getFileIdFromRequest`.
