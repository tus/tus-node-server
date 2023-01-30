# `@tus/gcs-store`

> 👉 **Note**: since 1.0.0 packages are split and published under the `@tus` scope.
> The old package, `tus-node-server`, is considered unstable and will only receive security fixes.
> Make sure to use the new packages, currently in beta at `1.0.0-beta.1`.

## Contents

- [Install](#install)
- [Use](#use)
- [API](#api)
  - [`new GCSStore(options)`](#new-gcsstoreoptions)
- [Types](#types)
- [Compatibility](#compatibility)
- [Contribute](#contribute)
- [License](#license)

## Install

In Node.js (16.0+), install with npm:

```bash
npm install @tus/gcs-store
```

## Use

```js
const {Server} = require('@tus/server')
const {GCSStore} = require('@tus/gcs-store')

const server = new Server({
  path: '/files',
  datastore: new GCSStore({
    storageOptions: {
      projectId: 'id',
      keyFilename: path.resolve('./some-path', 'keyfile.json'),
    },
    bucket: 'tus-node-server-ci',
  }),
})
// ...
```

## API

This package exports `GCSStore`. There is no default export.

### `new GCSStore(options)`

Creates a new Google Cloud Storage store with options or by passing a GCS bucket instance.

#### `options.storageOptions.projectId`

The GCS project ID (`string`).

#### `options.storageOptions.keyFilename`

Path to the keyfile with credentials (`string`).

#### `options.bucket`

The bucket name or bucket instance

## Extensions

The tus protocol supports optional [extensions][]. Below is a table of the supported extensions in `@tus/gcs-store`.

| Extension                | `@tus/gcs-store` |
| ------------------------ | ---------------- |
| [Creation][]             | ✅               |
| [Creation With Upload][] | ✅               |
| [Expiration][]           | ❌               |
| [Checksum][]             | ❌               |
| [Termination][]          | ❌               |
| [Concatenation][]        | ❌               |

## Types

This package is fully typed with TypeScript.

## Compatibility

This package requires Node.js 16.0+.

## Contribute

See [`contributing.md`](https://github.com/tus/tus-node-server/blob/main/.github/contributing.md).

## License

[MIT](https://github.com/tus/tus-node-server/blob/master/license) © [tus](https://github.com/tus)

[extensions]: https://tus.io/protocols/resumable-upload.html#protocol-extensions
[creation]: https://tus.io/protocols/resumable-upload.html#creation
[creation with upload]: https://tus.io/protocols/resumable-upload.html#creation-with-upload
[expiration]: https://tus.io/protocols/resumable-upload.html#expiration
[checksum]: https://tus.io/protocols/resumable-upload.html#checksum
[termination]: https://tus.io/protocols/resumable-upload.html#termination
[concatenation]: https://tus.io/protocols/resumable-upload.html#concatenation
