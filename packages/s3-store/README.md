# `@tus/s3-store`

> 👉 **Note**: since 1.0.0 packages are split and published under the `@tus` scope. The
> old package, `tus-node-server`, is considered unstable and will only receive security
> fixes. Make sure to use the new package.

## Contents

- [Install](#install)
- [Use](#use)
- [API](#api)
  - [`new S3Store(options)`](#new-s3storeoptions)
- [Extensions](#extensions)
- [Examples](#examples)
  - [Example: using `credentials` to fetch credentials inside a AWS container](#example-using-credentials-to-fetch-credentials-inside-a-aws-container)
  - [Example: use with Cloudflare R2](#example-use-with-cloudflare-r2)
  - [Example: use with Scaleway Object Storage](#example-use-with-scaleway-object-storage)
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

const s3Store = new S3Store({
  partSize: 8 * 1024 * 1024, // Each uploaded part will have ~8MiB,
  s3ClientConfig: {
    bucket: process.env.AWS_BUCKET,
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  },
})
const server = new Server({path: '/files', datastore: s3Store})
// ...
```

## API

This package exports `S3Store`. There is no default export.

### `new S3Store(options)`

Creates a new AWS S3 store with options.

#### `options.bucket`

The bucket name.

#### `options.partSize`

The **preferred** part size for parts send to S3. Can not be lower than 5MiB or more than
5GiB. The server calculates the optimal part size, which takes this size into account, but
may increase it to not exceed the S3 10K parts limit.

#### `options.minPartSize`

The minimal part size for parts.
Can be used to ensure that all non-trailing parts are exactly the same size
by setting `partSize` and `minPartSize` to the same value.
Can not be lower than 5MiB or more than 5GiB.

The server calculates the optimal part size, which takes this size into account, but
may increase it to not exceed the `options.maxMultipartParts` parts limit.

#### `options.maxMultipartParts`

The maximum number of parts allowed in a multipart upload. Defaults to 10,000.
Some S3 providers have non-standard restrictions on the number of parts in a multipart
upload. For example, AWS S3 has a limit of 10,000 parts, but some S3 compatible providers
have a limit of 1,000 parts.

#### `options.s3ClientConfig`

Options to pass to the AWS S3 SDK. Checkout the
[`S3ClientConfig`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/interfaces/s3clientconfig.html)
docs for the supported options. You need to at least set the `region`, `bucket` name, and
your preferred method of authentication.

#### `options.expirationPeriodInMilliseconds`

Enables the expiration extension and sets the expiration period of an upload url in
milliseconds. Once the expiration period has passed, the upload url will return a 410 Gone
status code.

#### `options.useTags`

Some S3 providers don't support tagging objects. If you are using certain features like
the expiration extension and your provider doesn't support tagging, you can set this
option to `false` to disable tagging.

#### `options.cache`

An optional cache implementation ([`KvStore`][]).

Default uses an in-memory cache (`MemoryKvStore`). When running multiple instances of the
server, you need to provide a cache implementation that is shared between all instances
like the `RedisKvStore`.

See the exported [KV stores][kvstores] from `@tus/server` for more information.

#### `options.maxConcurrentPartUploads`

This setting determines the maximum number of simultaneous part uploads to an S3 storage
service. The default value is 60. This default is chosen in conjunction with the typical
partSize of 8MiB, aiming for an effective transfer rate of 3.84Gbit/s.

**Considerations:** The ideal value for `maxConcurrentPartUploads` varies based on your
`partSize` and the upload bandwidth to your S3 bucket. A larger partSize means less
overall upload bandwidth available for other concurrent uploads.

- **Lowering the Value**: Reducing `maxConcurrentPartUploads` decreases the number of
  simultaneous upload requests to S3. This can be beneficial for conserving memory, CPU,
  and disk I/O resources, especially in environments with limited system resources or
  where the upload speed it low or the part size is large.

- **Increasing the Value**: A higher value potentially enhances the data transfer rate to
  the server, but at the cost of increased resource usage (memory, CPU, and disk I/O).
  This can be advantageous when the goal is to maximize throughput, and sufficient system
  resources are available.

- **Bandwidth Considerations**: It's important to note that if your upload bandwidth to S3
  is a limiting factor, increasing `maxConcurrentPartUploads` won’t lead to higher
  throughput. Instead, it will result in additional resource consumption without
  proportional gains in transfer speed.

## Extensions

The tus protocol supports optional [extensions][]. Below is a table of the supported
extensions in `@tus/s3-store`.

| Extension                | `@tus/s3-store` |
| ------------------------ | --------------- |
| [Creation][]             | ✅              |
| [Creation With Upload][] | ✅              |
| [Expiration][]           | ✅              |
| [Checksum][]             | ❌              |
| [Termination][]          | ✅              |
| [Concatenation][]        | ❌              |

### Termination

After a multipart upload is aborted, no additional parts can be uploaded using that upload
ID. The storage consumed by any previously uploaded parts will be freed. However, if any
part uploads are currently in progress, those part uploads might or might not succeed. As
a result, it might be necessary to set an
[S3 Lifecycle configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html)
to abort incomplete multipart uploads.

### Expiration

Unlike other stores, the expiration extension on the S3 store does not need to call
[`server.cleanUpExpiredUploads()`][cleanExpiredUploads]. The store creates a
`Tus-Completed` tag for all objects, including `.part` and `.info` files, to indicate
whether an upload is finished. This means you could setup a [lifecyle][] policy to
automatically clean them up without a CRON job.

```json
{
  "Rules": [
    {
      "Filter": {
        "Tag": {
          "Key": "Tus-Completed",
          "Value": "false"
        }
      },
      "Expiration": {
        "Days": 2
      }
    }
  ]
}
```

If you want more granularity, it is still possible to configure a CRON job to call
[`server.cleanExpiredUploads()`][cleanExpiredUploads] yourself.

## Examples

### Example: using `credentials` to fetch credentials inside a AWS container

The `credentials` config is directly passed into the AWS SDK so you can refer to the AWS
docs for the supported values of
[credentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Credentials.html#constructor-property)

```js
const aws = require('aws-sdk')
const {Server} = require('@tus/server')
const {S3Store} = require('@tus/s3-store')

const s3Store = new S3Store({
  partSize: 8 * 1024 * 1024,
  s3ClientConfig: {
    bucket: process.env.AWS_BUCKET,
    region: process.env.AWS_REGION,
    credentials: new aws.ECSCredentials({
      httpOptions: {timeout: 5000},
      maxRetries: 10,
    }),
  },
})
const server = new Server({path: '/files', datastore: s3Store})
// ...
```

### Example: use with Cloudflare R2

`@tus/s3-store` can be used with all S3-compatible storage solutions, including Cloudflare R2.
However R2 requires that all non-trailing parts are _exactly_ the same size.
This can be achieved by setting `partSize` and `minPartSize` to the same value.

```ts
// ...

const s3Store = new S3Store({
  partSize: 8 * 1024 * 1024,
  minPartSize: 8 * 1024 * 1024,
  // ...
})
```

### Example: use with Scaleway Object Storage

`@tus/s3-store` can be used with Scaleway Object Storage but with some additional configuration. Scaleway Object Storage has a limit of 1,000 parts in a multipart upload.

```ts
const s3Store = new S3Store({
  maxMultipartParts: 1000,
  // ...
})
```

## Types

This package is fully typed with TypeScript.

## Compatibility

This package requires Node.js 16.0+.

## Contribute

See
[`contributing.md`](https://github.com/tus/tus-node-server/blob/main/.github/contributing.md).

## License

[MIT](https://github.com/tus/tus-node-server/blob/master/license) ©
[tus](https://github.com/tus)

[extensions]: https://tus.io/protocols/resumable-upload.html#protocol-extensions
[creation]: https://tus.io/protocols/resumable-upload.html#creation
[creation with upload]:
  https://tus.io/protocols/resumable-upload.html#creation-with-upload
[expiration]: https://tus.io/protocols/resumable-upload.html#expiration
[checksum]: https://tus.io/protocols/resumable-upload.html#checksum
[termination]: https://tus.io/protocols/resumable-upload.html#termination
[concatenation]: https://tus.io/protocols/resumable-upload.html#concatenation
[cleanExpiredUploads]:
  https://github.com/tus/tus-node-server/tree/main/packages/server#servercleanupexpireduploads
[lifecyle]:
  https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html
[kvstores]: https://github.com/tus/tus-node-server/tree/main/packages/server#kvstores
[`KvStore`]:
  https://github.com/tus/tus-node-server/blob/main/packages/utils/src/kvstores/Types.ts
