---
"@tus/server": patch
---

Don't use AbortSignal.any to fix memory leak in older Node.js versions and to not break version support.
