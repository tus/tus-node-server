---
'@tus/server': patch
---

Fix a crash when `onResponseError` returns a null-body status (204, 205, or
304).
