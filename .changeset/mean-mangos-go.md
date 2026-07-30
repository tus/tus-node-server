---
"@tus/server": patch
---

Only install progress tracking when POST_RECEIVE listeners present.
Cancel pending trailing calls before writes settle to prevent late events.
