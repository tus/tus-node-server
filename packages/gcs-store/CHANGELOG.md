# @tus/gcs-store

## 1.4.2

### Patch Changes

- 8217f5e: Correctly pass the content type from upload.metadata to GCS.

## 1.4.1

### Patch Changes

- Updated dependencies [8f19a53]
  - @tus/utils@0.5.0

## 1.4.0

### Minor Changes

- de28c6e: Publish source maps and declaration maps

### Patch Changes

- Updated dependencies [de28c6e]
  - @tus/utils@0.4.0

## 1.3.0

### Minor Changes

- 117e1b2: Add basic storage information to the Upload model. You can now access
  `upload.storage` which has `type` (`file`, `s3`, `gcs`), `path`, and when applicable
  `bucket`.

### Patch Changes

- Updated dependencies [117e1b2]
  - @tus/utils@0.3.0

## 1.2.2

### Patch Changes

- 86b8b9f: Fix CRC32 error when writing offsetted data to store
- Updated dependencies [60698da]
  - @tus/utils@0.2.0

## 1.2.1

### Patch Changes

- 29a3644: Fix incorrectly published package

## 1.2.0

### Minor Changes

- a896d25: Add new @tus/utils dependency to replace @tus/server peer dependency

### Patch Changes

- Updated dependencies [a896d25]
  - @tus/utils@0.1.0
