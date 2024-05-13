# @tus/s3-store

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
