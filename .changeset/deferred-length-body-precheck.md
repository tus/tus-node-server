---
'@tus/server': patch
---

Reject a PATCH whose offset plus Content-Length exceeds its newly declared upload length before persisting that declaration.
