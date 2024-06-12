# @tus/server

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
