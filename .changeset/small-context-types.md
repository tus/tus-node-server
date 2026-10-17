---
"@tus/server": patch
---

Use the existing `CancellationContext` return type for `Server.createContext` so declaration generation succeeds with newer Node.js typings. This preserves the existing context shape and runtime behavior.
