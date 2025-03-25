# `@tus/gcs-store`

> 👉 **Note**: since 1.0.0 packages are split and published under the `@tus` scope. The
> old package, `tus-node-server`, is considered unstable and will only receive security
> fixes. Make sure to use the new packages.

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

In Node.js >=20.19.0, install with npm:

```bash
npm install @tus/gcs-store
```

## Use

```js
import { Server } from "@tus/server";
import { GCSStore } from "@tus/gcs-store";
import { Storage } from "@google-cloud/storage";

const storage = new Storage({ keyFilename: "key.json" });

const server = new Server({
  path: "/files",
  datastore: new GCSStore({
    bucket: storage.bucket("tus-node-server-ci"),
  }),
});
// ...
```

## API

This package exports `GCSStore`. There is no default export.

### `new GCSStore(options)`

Creates a new Google Cloud Storage store by passing a GCS bucket instance.

#### `options.bucket`

The bucket instance

## Extensions

The tus protocol supports optional [extensions][]. Below is a table of the supported
extensions in `@tus/gcs-store`.

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

This package requires Node.js >=20.19.0.

## Contribute

See
[`contributing.md`](https://github.com/tus/tus-node-server/blob/main/.github/contributing.md).

## License

[MIT](https://github.com/tus/tus-node-server/blob/master/license) ©
[tus](https://github.com/tus)

[extensions]: https://tus.io/protocols/resumable-upload.html#protocol-extensions
[creation]: https://tus.io/protocols/resumable-upload.html#creation
[creation with upload]: https://tus.io/protocols/resumable-upload.html#creation-with-upload
[expiration]: https://tus.io/protocols/resumable-upload.html#expiration
[checksum]: https://tus.io/protocols/resumable-upload.html#checksum
[termination]: https://tus.io/protocols/resumable-upload.html#termination
[concatenation]: https://tus.io/protocols/resumable-upload.html#concatenation
