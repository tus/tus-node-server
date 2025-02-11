---
"@tus/server": major
---

- Introduce `handleWeb(req: Request)` to integrate into meta frameworks
  (such as Next.js, Nuxt, React Router, SvelteKit, etc) and other Node.js compatible runtime environments.
- All events and hooks now emit `Request`/`Response` instead of `http.IncomingMessage`/`http.ServerResponse`.
- The function version of the options `maxSize`, `generateUrl`, `getFileIdFromRequest`, `namingFunction`, `locker`
  also now use `Request`/`Response`.
- Your `onUploadCreate` and `onUploadFinish` hooks no longer need to return the response object.
  - If you want to change the metadata in `onUploadCreate` you can return `Promise<{ metadata: Record<string, string> }>`.
    This will will internally merge the existing metadata with the new metadata.
  - `onUploadFinish` can return `Promise<{ status_code?: number headers?: Record<string, string | number> body?: string }>`
