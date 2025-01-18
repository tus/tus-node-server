---
"@tus/server": patch
"@tus/utils": patch
---

Consistent cancellation across streams and locks, fixing lock on file never being unlocked when the request ends prematurely.
