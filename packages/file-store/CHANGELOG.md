# @tus/file-store

## 1.4.0

### Minor Changes

- 117e1b2: Add basic storage information to the Upload model. You can now access
  `upload.storage` which has `type` (`file`, `s3`, `gcs`), `path`, and when applicable
  `bucket`.

### Patch Changes

- Updated dependencies [117e1b2]
  - @tus/utils@0.3.0

## 1.3.3

### Patch Changes

- Updated dependencies [60698da]
  - @tus/utils@0.2.0

## 1.3.2

### Patch Changes

- 54b7321: Fix dead links in README

## 1.3.1

### Patch Changes

- 29a3644: Fix incorrectly published package

## 1.3.0

### Minor Changes

- a896d25: Add new @tus/utils dependency to replace @tus/server peer dependency

### Patch Changes

- Updated dependencies [a896d25]
  - @tus/utils@0.1.0
