---
"@tus/server": patch
---

Stop delayed `POST_RECEIVE` events from firing after an upload write settles, and skip
progress tracking for writes that start without `POST_RECEIVE` listeners. Use `POST_FINISH`
when a terminal upload notification is required.
