# @tus/s3-store

## 1.9.0

### Minor Changes

- 7db2f17: Add `maxMultipartParts` option. This can be used when using S3-compatible storage provider with different part number limitations.

## 1.8.0

### Minor Changes

- 6351485: Add `minPartSize` option. This can be used alongside `partSize` to guarantee that all non-trailing parts are _exactly_ the same size, which is required for Cloudflare R2.

### Patch Changes

- c970858: Fix zero byte files only storing a .info file. Now correctly stores an empty file.

## 1.7.0

### Minor Changes

- b1c07bc: Change private modifier to protected

### Patch Changes

- 8236c05: Bump @aws-sdk/client-s3 from 3.703.0 to 3.717.0
- Updated dependencies [42c6267]
  - @tus/utils@0.5.1

## 1.6.2

### Patch Changes

- 32d847d: Fix increment for part numbers
- fdad8ff: Bump @aws-sdk/client-s3 from 3.701.0 to 3.703.0

## 1.6.1

### Patch Changes

- Updated dependencies [8f19a53]
  - @tus/utils@0.5.0

## 1.6.0

### Minor Changes

- de28c6e: Publish source maps and declaration maps

### Patch Changes

- Updated dependencies [de28c6e]
  - @tus/utils@0.4.0

## 1.5.0

### Minor Changes

- 117e1b2: Add basic storage information to the Upload model. You can now access
  `upload.storage` which has `type` (`file`, `s3`, `gcs`), `path`, and when applicable
  `bucket`.

### Patch Changes

- Updated dependencies [117e1b2]
  - @tus/utils@0.3.0

## 1.4.3

### Patch Changes

- Updated dependencies [60698da]
  - @tus/utils@0.2.0

## 1.4.2

### Patch Changes

- 54b7321: Fix dead links in README

## 1.4.1

### Patch Changes

- 29a3644: Fix incorrectly published package

## 1.4.0

### Minor Changes

- 0393e75: Introduce backpressure to avoid writing more temporary files to disk than we
  can upload & fix offset calculation by downloading the incomplete part first
- a896d25: Add new @tus/utils dependency to replace @tus/server peer dependency

### Patch Changes

- Updated dependencies [a896d25]
  - @tus/utils@0.1.0
