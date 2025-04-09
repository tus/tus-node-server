---
"@tus/server": minor
---

Use srvx for convert Node.js req/res to Request/Response. This also comes with a performance boost. When using `server.handle()` in a Node.js environment, you can now access the orignal req/res via `req.node.req`/`req.node.res`.
