# @tus/utils

## 0.3.0

### Minor Changes

- 117e1b2: Add basic storage information to the Upload model. You can now access
  `upload.storage` which has `type` (`file`, `s3`, `gcs`), `path`, and when applicable
  `bucket`.

## 0.2.0

### Minor Changes

- 60698da: Introduce POST_RECEIVE_V2 event, which correctly fires during the stream write
  rather than after it is finished

## 0.1.0

### Minor Changes

- a896d25: Introduce @tus/utils for code sharing between packages
