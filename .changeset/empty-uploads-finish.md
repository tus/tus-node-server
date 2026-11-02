---
"@tus/server": patch
---

Finalize zero-length uploads before calling `onUploadFinish` or emitting `POST_FINISH`. Ordinary POST requests with `Upload-Length: 0` now call the store's `write` method with an empty stream at offset 0, so stores can complete the empty object.
