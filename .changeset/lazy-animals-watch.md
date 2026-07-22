---
"@tus/server": patch
---

Compute the `Access-Control-Expose-Headers` value once in the constructor instead of rebuilding it on every request.
