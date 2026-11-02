---
"@tus/server": patch
---

Allow HEAD requests for completed uploads after their original expiration deadline. Unfinished uploads continue to return 410 Gone after expiration.
