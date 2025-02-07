# @tus/server

## 1.10.2

### Patch Changes

- 06954ac: Don't use AbortSignal.any to fix memory leak in older Node.js versions and to not break version support.

## 1.10.1

### Patch Changes

- 42c6267: Consistent cancellation across streams and locks, fixing lock on file never being unlocked when the request ends prematurely.
- Updated dependencies [42c6267]
  - @tus/utils@0.5.1

## 1.10.0

### Minor Changes

- 8f19a53: Add ioredis as optional dependency

### Patch Changes

- f465a0f: Send Tus-Version header in OPTIONS
- Updated dependencies [8f19a53]
  - @tus/utils@0.5.0

## 1.9.0

### Minor Changes

- a3c3a99: add Content-Type and Content-Disposition headers on GetHandler.send response

## 1.8.0

### Minor Changes

- de28c6e: Publish source maps and declaration maps
- ca03351: - Add `allowedCredentials` option for the Access-Control-Allow-Credentials header
  - Add `allowedOrigins` option for setting domains in Access-Control-Allow-Origin

### Patch Changes

- Updated dependencies [de28c6e]
  - @tus/utils@0.4.0

## 1.7.0

### Minor Changes

- ea2bf07: Add `lastPath` argument to `getFileIdFromRequest` to simplify a common use
  case.

### Patch Changes

- Updated dependencies [117e1b2]
  - @tus/utils@0.3.0

## 1.6.0

### Minor Changes

- 60698da: Introduce POST_RECEIVE_V2 event, which correctly fires during the stream write
  rather than after it is finished
- 0f90980: Allow onUploadFinish hook to override response data

### Patch Changes

- Updated dependencies [60698da]
  - @tus/utils@0.2.0

## 1.5.0

### Minor Changes

- 9967900: Add `lockDrainTimeout` option
- 9967900: Allow onUploadCreate hook to override metadata

## 1.4.2

### Patch Changes

- 54b7321: Document `locker` option and fix dead links in README

## 1.4.1

### Patch Changes

- 29a3644: Fix incorrectly published package

## 1.4.0

### Minor Changes

- 1a4339a: Support async `namingFunction`
- a896d25: Add new @tus/utils dependency to replace @tus/server peer dependency

### Patch Changes

- Updated dependencies [a896d25]
  - @tus/utils@0.1.0
