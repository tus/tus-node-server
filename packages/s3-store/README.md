# `@tus/s3-store`

> 👉 **Note**: since 1.0.0 packages are split and published under the `@tus` scope.
> The old package, `tus-node-server`, is considered unstable and will only receive security fixes.
> Make sure to use the new packages, currently in beta at `1.0.0-beta.1`.

## Contents

- [Install](#install)
- [Use](#use)
- [API](#api)
  - [`new S3Store(options)`](#new-s3storeoptions)
- [Extensions](#extensions)
- [Examples](#examples)
  - [Example: using `credentials` to fetch credentials inside a AWS container](#example-using-credentials-to-fetch-credentials-inside-a-aws-container)
- [Types](#types)
- [Compatibility](#compatibility)
- [Contribute](#contribute)
- [License](#license)

## Install

In Node.js (16.0+), install with npm:

```bash
npm install @tus/s3-store
```

## Use

```js
const {Server} = require('@tus/server')
const {S3Store} = require('@tus/s3-store')

const server = new Server({
  path: '/files',
  datastore: new S3Store({
    bucket: process.env.AWS_BUCKET,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    partSize: 8 * 1024 * 1024, // Each uploaded part will have ~8MB,
  }),
})
// ...
```

## API

This package exports `S3Store`. There is no default export.

### `new S3Store(options)`

Creates a new AWS S3 store with options.

> **Note**
> All options except for `bucket` and `partSize` are directly passed to the S3 client.
> This means you can also provide alternative authentication properties, such as [credentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Credentials.html#constructor-property).

#### `options.bucket`

The bucket name.

#### `options.partSize`

The preferred part size for parts send to S3. Can not be lower than 5MB or more than 500MB.
The server calculates the optimal part size, which takes this size into account,
but may increase it to not exceed the S3 10K parts limit.

## Extensions

The tus protocol supports optional [extensions][]. Below is a table of the supported extensions in `@tus/s3-store`.

| Extension                | `@tus/s3-store` |
| ------------------------ | --------------- |
| [Creation][]             | ✅              |
| [Creation With Upload][] | ✅              |
| [Expiration][]           | ❌              |
| [Checksum][]             | ❌              |
| [Termination][]          | ❌              |
| [Concatenation][]        | ❌              |

## Examples

### Example: using `credentials` to fetch credentials inside a AWS container

The `credentials` config is directly passed into the AWS SDK so you can refer to the AWS docs for the supported values of [credentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Credentials.html#constructor-property)

```js
const aws = require('aws-sdk')
const {Server} = require('@tus/server')
const {FileStore} = require('@tus/s3-store')

const server = new Server({
  path: '/files',
  datastore: new S3Store({
    bucket: 'bucket-name',
    partSize: 8 * 1024 * 1024, // Each uploaded part will have ~8MB,
    credentials: new aws.ECSCredentials({
      httpOptions: {timeout: 5000},
      maxRetries: 10,
    }),
    region: 'eu-west-1',
    tmpDirPrefix: 'tus-s3-store',
  }),
})
// ...
```

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
