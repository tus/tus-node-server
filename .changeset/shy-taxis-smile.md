---
'@tus/server': patch
---

Fix a crash when a response hook returns a null-body status (204, 205, or 304).
