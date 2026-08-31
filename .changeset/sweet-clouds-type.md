---
"@tus/server": patch
---

Set CORS headers before the 412 Tus-Resumable check and header-validation 400s so browsers can read those responses.
