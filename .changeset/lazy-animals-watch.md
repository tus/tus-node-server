---
"@tus/server": patch
---

Use the precomputed `EXPOSED_HEADERS` constant for the default `Access-Control-Expose-Headers` value instead of rebuilding it on every request.
