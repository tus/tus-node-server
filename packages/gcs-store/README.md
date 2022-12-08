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
    projectId: 'id',
    keyFilename: path.resolve('./some-path', 'keyfile.json'),
    bucket: 'tus-node-server-ci',
  }),
})
// ...
```

## API

This package exports `GCSStore`. There is no default export.

### `new GCSStore(options)`

Creates a new Google Cloud Storage store with options.

#### `projectId`

The GCS project ID (`string`).

#### `keyFilename`

Path to the keyfile with credentials (`string`).

#### `bucket`

The bucket name.

## Types

This package is fully typed with TypeScript.

## Compatibility

This package requires Node.js 16.0+.

## Contribute

See [`contributing.md`](https://github.com/tus/tus-node-server/blob/main/.github/contributing.md).

## License

[MIT](https://github.com/tus/tus-node-server/blob/master/license) © [tus](https://github.com/tus)
