---
'@tus/server': patch
---

Fix a crash when a hook returns a null-body status (204, 205, or 304). Responses
with these statuses now omit the body and `Content-Length` header.
