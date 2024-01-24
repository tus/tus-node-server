# `@tus/server`

> 👉 **Note**: since 1.0.0 packages are split and published under the `@tus` scope.
> The old package, `tus-node-server`, is considered unstable and will only receive security fixes.
> Make sure to use the new package.

## Contents

- [Install](#install)
- [Use](#use)
- [API](#api)
  - [`new Server(options)`](#new-serveroptions)
  - [`EVENTS`](#events)
- [Examples](#examples)
  - [Example: integrate tus into Express](#example-integrate-tus-into-express)
  - [Example: integrate tus into Koa](#example-integrate-tus-into-koa)
  - [Example: integrate tus into Fastify](#example-integrate-tus-into-fastify)
  - [Example: integrate tus into Next.js](#example-integrate-tus-into-nextjs)
  - [Example: validate metadata when an upload is created](#example-validate-metadata-when-an-upload-is-created)
  - [Example: store files in custom nested directories](#example-store-files-in-custom-nested-directories)
- [Types](#types)
- [Compatibility](#compatibility)
- [Contribute](#contribute)
- [License](#license)

## Install

In Node.js (16.0+), install with npm:

```bash
npm install @tus/server
```

## Use

A standalone server which stores files on disk.

```js
const {Server} = require('@tus/server')
const {FileStore} = require('@tus/file-store')
const host = '127.0.0.1'
const port = 1080

const server = new Server({
  path: '/files',
  datastore: new FileStore({directory: './files'}),
})
server.listen({host, port})
```

## API

This package exports `Server` and all [`constants`][], [`types`][], [`models`][], and [`kvstores`][]. There is no default export.
You should only need the `Server`, `EVENTS`, and KV store exports.

### `new Server(options)`

Creates a new tus server with options.

#### `options.path`

The route to accept requests (`string`).

#### `options.maxSize`

Max file size (in bytes) allowed when uploading (`number` | (`(req, id: string | null) => Promise<number> | number`)).
When providing a function during the OPTIONS request the id will be `null`.

#### `options.relativeLocation`

Return a relative URL as the `Location` header to the client (`boolean`).

#### `options.respectForwardedHeaders`

Allow `Forwarded`, `X-Forwarded-Proto`, and `X-Forwarded-Host` headers to override the `Location` header returned by the server (`boolean`).

#### `options.allowedHeaders`

Additional headers sent in `Access-Control-Allow-Headers` (`string[]`).

#### `options.generateUrl`

Control how the upload URL is generated (`(req, { proto, host, path, id }) => string)`)

This only changes the upload URL (`Location` header).
If you also want to change the file name in storage use `namingFunction`.
Returning `prefix-1234` in `namingFunction` means the `id` argument in `generateUrl` is `prefix-1234`.

`@tus/server` expects everything in the path after the last `/` to be the upload id.
If you change that you have to use `getFileIdFromRequest` as well.

A common use case of this function and `getFileIdFromRequest` is to base65 encode a complex id into the URL.

> [!TIP]
> Checkout the example how to [store files in custom nested directories](#example-store-files-in-custom-nested-directories).

#### `options.getFileIdFromRequest`

Control how the Upload-ID is extracted from the request (`(req) => string | void`)
By default, it expects everything in the path after the last `/` to be the upload id.

> [!TIP]
> Checkout the example how to [store files in custom nested directories](#example-store-files-in-custom-nested-directories).

#### `options.namingFunction`

Control how you want to name files (`(req, metadata) => string | Promise<string>`)

In `@tus/server`, the upload ID in the URL is the same as the file name.
This means using a custom `namingFunction` will return a different `Location` header for uploading
and result in a different file name in storage.

It is important to make these unique to prevent data loss. Only use it if you need to.
Default uses `crypto.randomBytes(16).toString('hex')`.

> [!TIP]
> Checkout the example how to [store files in custom nested directories](#example-store-files-in-custom-nested-directories).

#### `disableTerminationForFinishedUploads`

Disallow the [termination extension](https://tus.io/protocols/resumable-upload#termination) for finished uploads. (`boolean`)

#### `options.onUploadCreate`

`onUploadCreate` will be invoked before a new upload is created. (`(req, res, upload) => Promise<res>`).

If the function returns the (modified) response, the upload will be created.
You can `throw` an Object and the HTTP request will be aborted with the provided `body` and `status_code` (or their fallbacks).

This can be used to implement validation of upload metadata or add headers.

#### `options.onUploadFinish`

`onUploadFinish` will be invoked after an upload is completed but before a response is returned to the client (`(req, res, upload) => Promise<res>`).

If the function returns the (modified) response, the upload will finish.
You can `throw` an Object and the HTTP request will be aborted with the provided `body` and `status_code` (or their fallbacks).

This can be used to implement post-processing validation.

#### `options.onIncomingRequest`

`onIncomingRequest` is a middleware function invoked before all handlers (`(req, res) => Promise<void>`)

This can be used for things like access control.
You can `throw` an Object and the HTTP request will be aborted with the provided `body` and `status_code` (or their fallbacks).

#### `options.onResponseError`

`onResponseError` will be invoked when an error response is about to be sent by the server.
you use this function to map custom errors to tus errors or for custom observability. (`(req, res, err) =>  Promise<{status_code: number; body: string} | void> | {status_code: number; body: string} | void`)

#### `server.handle(req, res)`

The main server request handler invoked on every request.
You only need to use this when you integrate tus into an existing Node.js server.

#### `server.get(req, res)`

You can implement your own `GET` handlers. For instance, to return all files.

```js
const fs = require('node:fs/promises')
const {Server} require('@tus/server')
const {FileStore} require('@tus/file-store')

const server = new Server({
  path: '/files',
  datastore: new FileStore({ directory: './files' }),
})

server.get('/uploads', async (req, res) => {
  const files = await fs.readdir(server.datastore.directory)
  // Format and return
})
```

#### `server.listen()`

Start the tus server. Supported arguments are the same as [`server.listen()`](https://nodejs.org/api/net.html#serverlisten) from `node:net`.

#### `server.cleanUpExpiredUploads()`

Clean up expired uploads. Your chosen datastore must support the [expiration][] extension for this to work.

### `EVENTS`

Events to subscribe to (`Object<string>`).

You can listen for events by using the `.on()` method on the `Server` instance.

#### `POST_CREATE`

Called after an upload has been created but before it's written to a store.

```js
const {EVENTS} = require('@tus/server')
// ...
server.on(EVENTS.POST_CREATE, (req, res, upload => {})
```

#### `POST_RECEIVE`

Called every time a `PATCH` request is handled.

```js
const {EVENTS} = require('@tus/server')
// ...
server.on(EVENTS.POST_RECEIVE, (req, res, upload => {})
```

#### `POST_FINISH`

Called an upload has completed and after a response has been sent to the client.

```js
const {EVENTS} = require('@tus/server')
// ...
server.on(EVENTS.POST_FINISH, (req, res, upload => {})
```

#### `POST_TERMINATE`

Called after an upload has been terminated and a response has been sent to the client.

```js
const {EVENTS} = require('@tus/server')
// ...
server.on(EVENTS.POST_TERMINATE, (req, res, id => {})
```

### Key-Value Stores

All stores (as in the `datastore` option) save two files,
the uploaded file and an info file with metadata, usually adjacent to each other.

In `@tus/file-store` the `FileKvStore` is used to persist upload info but the KV stores
can also be used as a cache in other stores, such as `@tus/s3-store`.

#### `MemoryKvStore`

```ts
import {MemoryKvStore} from '@tus/server'
import S3Store, {type MetadataValue} from '@tus/s3-store'

new S3Store({
  // ...
  cache: new MemoryKvStore<MetadataValue>(),
})
```

#### `FileKvStore`

```ts
import {FileKvStore} from '@tus/server'
import S3Store, {type MetadataValue} from '@tus/s3-store'

const path = './uploads'

new S3Store({
  // ...
  cache: new FileKvStore<MetadataValue>(path),
})
```

#### `RedisKvStore`

```ts
import {RedisKvStore} from '@tus/server'
import S3Store, {type MetadataValue} from '@tus/s3-store'
import {createClient} from '@redis/client'

const client = await createClient().connect()
const path = './uploads'
const prefix = 'foo' // prefix for the key (foo${id})

new S3Store({
  // ...
  cache: new RedisKvStore<MetadataValue>(client, prefix),
})
```

## Examples

### Example: integrate tus into Express

```js
const {Server} = require('@tus/server')
const {FileStore} = require('@tus/file-store')
const express = require('express')

const host = '127.0.0.1'
const port = 1080
const app = express()
const uploadApp = express()
const server = new Server({
  path: '/uploads',
  datastore: new FileStore({directory: '/files'}),
})

uploadApp.all('*', server.handle.bind(server))
app.use('/uploads', uploadApp)
app.listen(port, host)
```

### Example: integrate tus into Koa

```js
const http = require('node:http')
const url = require('node:url')
const Koa = require('koa')
const {Server} = require('@tus/server')
const {FileStore} = require('@tus/file-store')

const app = new Koa()
const appCallback = app.callback()
const port = 1080
const tusServer = new Server({
  path: '/files',
  datastore: new FileStore({directory: '/files'}),
})

const server = http.createServer((req, res) => {
  const urlPath = url.parse(req.url).pathname

  // handle any requests with the `/files/*` pattern
  if (/^\/files\/.+/.test(urlPath.toLowerCase())) {
    return tusServer.handle(req, res)
  }

  appCallback(req, res)
})

server.listen(port)
```

### Example: integrate tus into Fastify

```js
const fastify = require('fastify')({logger: true})
const {Server} = require('@tus/server')
const {FileStore} = require('@tus/file-store')

const tusServer = new Server({
  path: '/files',
  datastore: new FileStore({directory: './files'}),
})

/**
 * add new content-type to fastify forewards request
 * without any parser to leave body untouched
 * @see https://www.fastify.io/docs/latest/Reference/ContentTypeParser/
 */
fastify.addContentTypeParser(
  'application/offset+octet-stream',
  (request, payload, done) => done(null)
)

/**
 * let tus handle preparation and filehandling requests
 * fastify exposes raw nodejs http req/res via .raw property
 * @see https://www.fastify.io/docs/latest/Reference/Request/
 * @see https://www.fastify.io/docs/latest/Reference/Reply/#raw
 */
fastify.all('/files', (req, res) => {
  tusServer.handle(req.raw, res.raw)
})
fastify.all('/files/*', (req, res) => {
  tusServer.handle(req.raw, res.raw)
})
fastify.listen(3000, (err) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

### Example: integrate tus into Next.js

Attach the tus server handler to a Next.js route handler in an [optional catch-all route file](https://nextjs.org/docs/routing/dynamic-routes#optional-catch-all-routes)

`/pages/api/upload/[[...file]].ts`

```ts
import type {NextApiRequest, NextApiResponse} from 'next'
import {Server, Upload} from '@tus/server'
import {FileStore} from '@tus/file-store'

/**
 * !Important. This will tell Next.js NOT Parse the body as tus requires
 * @see https://nextjs.org/docs/api-routes/request-helpers
 */
export const config = {
  api: {
    bodyParser: false,
  },
}

const tusServer = new Server({
  // `path` needs to match the route declared by the next file router
  // ie /api/upload
  path: '/api/upload',
  datastore: new FileStore({directory: './files'}),
})

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return tusServer.handle(req, res)
}
```

### Example: validate metadata when an upload is created

```js
const {Server} = require('@tus/server')
// ...

const server = new Server({
  // ..
  async onUploadCreate(req, res, upload) {
    const {ok, expected, received} = validateMetadata(upload)
    if (!ok) {
      const body = `Expected "${expected}" in "Upload-Metadata" but received "${received}"`
      throw {status_code: 500, body} // if undefined, falls back to 500 with "Internal server error".
    }
    // We have to return the (modified) response.
    return res
  },
})
```

### Example: access control

Access control is opinionated and can be done in different ways.
This example is psuedo-code for what it could look like with JSON Web Tokens.

```js
const {Server} = require('@tus/server')
// ...

const server = new Server({
  // ..
  async onIncomingRequest(req, res) {
    const token = req.headers.authorization

    if (!token) {
      throw {status_code: 401, body: 'Unauthorized'}
    }

    try {
      const decodedToken = await jwt.verify(token, 'your_secret_key')
      req.user = decodedToken
    } catch (error) {
      throw {status_code: 401, body: 'Invalid token'}
    }

    if (req.user.role !== 'admin') {
      throw {status_code: 403, body: 'Access denied'}
    }
  },
})
```

### Example: store files in custom nested directories

You can use `namingFunction` to change the name of the stored file.
If you’re only adding a prefix or suffix without a slash (`/`),
you don’t need to implement `generateUrl` and `getFileIdFromRequest`.

Adding a slash means you create a new directory, for which you need
to implement all three functions as we need encode the id with base64 into the URL.

```js
const path = '/files'
const server = new Server({
  path,
  datastore: new FileStore({directory: './test/output'}),
  namingFunction(req) {
    const id = crypto.randomBytes(16).toString('hex')
    const folder = getFolderForUser(req) // your custom logic
    return `users/${folder}/${id}`
  },
  generateUrl(req, {proto, host, path, id}) {
    id = Buffer.from(id, 'utf-8').toString('base64url')
    return `${proto}://${host}${path}/${id}`
  },
  getFileIdFromRequest(req) {
    const reExtractFileID = /([^/]+)\/?$/
    const match = reExtractFileID.exec(req.url as string)

    if (!match || path.includes(match[1])) {
      return
    }

    return Buffer.from(match[1], 'base64url').toString('utf-8')
  },
})

```

## Types

This package is fully typed with TypeScript.

## Compatibility

This package requires Node.js 16.0+.

## Contribute

See [`contributing.md`](https://github.com/tus/tus-node-server/blob/main/.github/contributing.md).

## License

[MIT](https://github.com/tus/tus-node-server/blob/master/license) © [tus](https://github.com/tus)

[`@tus/file-store`]: https://github.com/tus/tus-node-server/tree/main/packages/file-store
[`@tus/s3-store`]: https://github.com/tus/tus-node-server/tree/main/packages/s3-store
[`@tus/gcs-store`]: https://github.com/tus/tus-node-server/tree/main/packages/gcs-store
[`constants`]: https://github.com/tus/tus-node-server/blob/main/packages/server/src/constants.ts
[`types`]: https://github.com/tus/tus-node-server/blob/main/packages/server/src/types.ts
[`models`]: https://github.com/tus/tus-node-server/blob/main/packages/server/src/models/index.ts
[`kvstores`]: https://github.com/tus/tus-node-server/blob/main/packages/server/src/kvstores/index.ts
[expiration]: https://tus.io/protocols/resumable-upload.html#expiration
