# `@tus/server`

> 👉 **Note**: since 1.0.0 packages are split and published under the `@tus` scope. The
> old package, `tus-node-server`, is considered unstable and will only receive security
> fixes. Make sure to use the new package.

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
  - [Example: use with Nginx](#example-use-with-nginx)
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

This package exports `Server` and all [`constants`][], [`types`][], [`models`][], and
[`kvstores`][]. There is no default export. You should only need the `Server`, `EVENTS`,
and KV store exports.

### `new Server(options)`

Creates a new tus server with options.

#### `options.path`

The route to accept requests (`string`).

#### `options.maxSize`

Max file size (in bytes) allowed when uploading (`number` |
(`(req, id: string | null) => Promise<number> | number`)). When providing a function
during the OPTIONS request the id will be `null`.

#### `options.allowedCredentials`

Sets `Access-Control-Allow-Credentials` (`boolean`, default: `false`).

#### `options.allowedOrigins`

Trusted origins (`string[]`).

Sends the client's origin back in `Access-Control-Allow-Origin` if it matches.

#### `options.postReceiveInterval`

Interval in milliseconds for sending progress of an upload over
[`POST_RECEIVE_V2`](#eventspost_receive_v2) (`number`).

#### `options.relativeLocation`

Return a relative URL as the `Location` header to the client (`boolean`).

#### `options.respectForwardedHeaders`

Allow `Forwarded`, `X-Forwarded-Proto`, and `X-Forwarded-Host` headers to override the
`Location` header returned by the server (`boolean`).

#### `options.allowedHeaders`

Additional headers sent in `Access-Control-Allow-Headers` (`string[]`).

#### `options.generateUrl`

Control how the upload URL is generated (`(req, { proto, host, path, id }) => string)`)

This only changes the upload URL (`Location` header). If you also want to change the file
name in storage use `namingFunction`. Returning `prefix-1234` in `namingFunction` means
the `id` argument in `generateUrl` is `prefix-1234`.

`@tus/server` expects everything in the path after the last `/` to be the upload id. If
you change that you have to use `getFileIdFromRequest` as well.

A common use case of this function and `getFileIdFromRequest` is to base65 encode a
complex id into the URL.

Checkout the example how to
[store files in custom nested directories](#example-store-files-in-custom-nested-directories).

#### `options.getFileIdFromRequest`

Control how the Upload-ID is extracted from the request
(`(req, lastPath) => string | void`)

By default, it expects everything in the path after the last `/` to be the upload id.
`lastPath` is everything after the last `/`.

Checkout the example how to
[store files in custom nested directories](#example-store-files-in-custom-nested-directories).

#### `options.namingFunction`

Control how you want to name files (`(req, metadata) => string | Promise<string>`)

In `@tus/server`, the upload ID in the URL is the same as the file name. This means using
a custom `namingFunction` will return a different `Location` header for uploading and
result in a different file name in storage.

It is important to make these unique to prevent data loss. Only use it if you need to.
Default uses `crypto.randomBytes(16).toString('hex')`.

Checkout the example how to
[store files in custom nested directories](#example-store-files-in-custom-nested-directories).

#### `options.locker`

The locker interface to manage locks for exclusive access control over resources
([`Locker`][]).

By default it uses an in-memory locker ([`MemoryLocker`][]) for safe concurrent access to
uploads using a single server. When running multiple instances of the server, you need to
provide a locker implementation that is shared between all instances (such as a
`RedisLocker`).

#### `options.disableTerminationForFinishedUploads`

Disallow the
[termination extension](https://tus.io/protocols/resumable-upload#termination) for
finished uploads. (`boolean`)

#### `options.onUploadCreate`

`onUploadCreate` will be invoked before a new upload is created.
(`(req, res, upload) => Promise<{ res: http.ServerResponse, metadata?: Record<string, string>}>`).

- If the function returns the (modified) response the upload will be created.
- You can optionally return `metadata` which will override (not merge!) `upload.metadata`.
- You can `throw` an Object and the HTTP request will be aborted with the provided `body`
  and `status_code` (or their fallbacks).

This can be used to implement validation of upload metadata or add headers.

#### `options.onUploadFinish`

`onUploadFinish` will be invoked after an upload is completed but before a response is
returned to the client
(`(req, res, upload) => Promise<{ res: http.ServerResponse, status_code?: number, headers?: Record<string, string | number>, body?: string }>`).

- You can optionally return `status_code`, `headers` and `body` to modify the response.
  Note that the tus specification does not allow sending response body nor status code
  other than 204, but most clients support it. Use at your own risk.
- You can `throw` an Object and the HTTP request will be aborted with the provided `body`
  and `status_code` (or their fallbacks).

This can be used to implement post-processing validation.

#### `options.onIncomingRequest`

`onIncomingRequest` is a middleware function invoked before all handlers
(`(req, res) => Promise<void>`)

This can be used for things like access control. You can `throw` an Object and the HTTP
request will be aborted with the provided `body` and `status_code` (or their fallbacks).

#### `options.onResponseError`

`onResponseError` will be invoked when an error response is about to be sent by the
server. you use this function to map custom errors to tus errors or for custom
observability.
(`(req, res, err) => Promise<{status_code: number; body: string} | void> | {status_code: number; body: string} | void`)

#### `server.handle(req, res)`

The main server request handler invoked on every request. You only need to use this when
you integrate tus into an existing Node.js server.

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

Start the tus server. Supported arguments are the same as
[`server.listen()`](https://nodejs.org/api/net.html#serverlisten) from `node:net`.

#### `server.cleanUpExpiredUploads()`

Clean up expired uploads. Your chosen datastore must support the [expiration][] extension
for this to work.

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

**Deprecated**.

Called every time an upload finished writing to the store. This event is emitted whenever
the request handling is completed (which is the same as `onUploadFinish`, almost the same
as `POST_FINISH`), whereas the `POST_RECEIVE_V2` event is emitted _while_ the request is
being handled.

```js
const {EVENTS} = require('@tus/server')
// ...
server.on(EVENTS.POST_RECEIVE, (req, res, upload => {})
```

#### `POST_RECEIVE_V2`

Called every [`postReceiveInterval`](#optionspostreceiveinterval) milliseconds for every
upload while it‘s being written to the store.

This means you are not guaranteed to get (all) events for an upload. For instance if
`postReceiveInterval` is set to 1000ms and an PATCH request takes 500ms, no event is
emitted. If the PATCH request takes 2500ms, you would get the offset at 2000ms, but not at
2500ms.

Use `POST_FINISH` if you need to know when an upload is done.

```js
const {EVENTS} = require('@tus/server')
// ...
server.on(EVENTS.POST_RECEIVE_V2, (req, upload => {})
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

All stores (as in the `datastore` option) save two files, the uploaded file and an info
file with metadata, usually adjacent to each other.

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
const prefix = 'foo' // prefix for the key (foo${id})

new S3Store({
  // ...
  cache: new RedisKvStore<MetadataValue>(client, prefix),
})
```

#### `IoRedisKvStore`

```ts
import { IoRedisKvStore } from '@tus/server';
import S3Store, { type MetadataValue } from '@tus/s3-store';
import Redis from 'ioredis';

const client = new Redis();
const prefix = 'foo'; // prefix for the key (foo${id})

new S3Store({
  // ...
  cache: new IoRedisKvStore<MetadataValue>(client, prefix),
});
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

Attach the tus server handler to a Next.js route handler in an
[optional catch-all route file](https://nextjs.org/docs/routing/dynamic-routes#optional-catch-all-routes)

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
    const {ok, expected, received} = validateMetadata(upload) // your logic
    if (!ok) {
      const body = `Expected "${expected}" in "Upload-Metadata" but received "${received}"`
      throw {status_code: 500, body} // if undefined, falls back to 500 with "Internal server error".
    }
    // You can optionally return metadata to override the upload metadata,
    // such as `{ storagePath: "/upload/123abc..." }`
    const extraMeta = getExtraMetadata(req) // your logic
    return {res, metadata: {...upload.metadata, ...extraMeta}}
  },
})
```

### Example: access control

Access control is opinionated and can be done in different ways. This example is
psuedo-code for what it could look like with JSON Web Tokens.

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

You can use `namingFunction` to change the name of the stored file. If you’re only adding
a prefix or suffix without a slash (`/`), you don’t need to implement `generateUrl` and
`getFileIdFromRequest`.

Adding a slash means you create a new directory, for which you need to implement all three
functions as we need encode the id with base64 into the URL.

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
  getFileIdFromRequest(req, lastPath) {
    // lastPath is everything after the last `/`
    // If your custom URL is different, this might be undefined
    // and you need to extract the ID yourself
    return Buffer.from(lastPath, 'base64url').toString('utf-8')
  },
})
```

### Example: use with Nginx

In some cases, it is necessary to run behind a reverse proxy (Nginx, HAProxy etc), for
example for TLS termination or serving multiple services on the same hostname. To properly
do this, `@tus/server` and the proxy must be configured appropriately.

Firstly, you must set `respectForwardedHeaders` indicating that a reverse proxy is in use
and that it should respect the `X-Forwarded-*`/`Forwarded` headers:

```js
const {Server} = require('@tus/server')
// ...

const server = new Server({
  // ..
  respectForwardedHeaders: true,
})
```

Secondly, some of the reverse proxy's settings should be adjusted. The exact steps depend
on the used proxy, but the following points should be checked:

- _Disable request buffering._ Nginx, for example, reads the entire incoming HTTP request,
  including its body, before sending it to the backend, by default. This behavior defeats
  the purpose of resumability where an upload is processed and saved while it's being
  transferred, allowing it be resumed. Therefore, such a feature must be disabled.

- _Adjust maximum request size._ Some proxies have default values for how big a request
  may be in order to protect your services. Be sure to check these settings to match the
  requirements of your application.

- _Forward hostname and scheme._ If the proxy rewrites the request URL, the tusd server
  does not know the original URL which was used to reach the proxy. This behavior can lead
  to situations, where tusd returns a redirect to a URL which can not be reached by the
  client. To avoid this issue, you can explicitly tell tusd which hostname and scheme to
  use by supplying the `X-Forwarded-Host` and `X-Forwarded-Proto` headers. Configure the
  proxy to set these headers to the original hostname and protocol when forwarding
  requests to tusd.

You can also take a look at the
[Nginx configuration from tusd](https://github.com/tus/tusd/blob/main/examples/nginx.conf)
which is used to power the [tusd.tusdemo.net](https://tusd.tusdemo.net) instance.

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

[`@tus/file-store`]: https://github.com/tus/tus-node-server/tree/main/packages/file-store
[`@tus/s3-store`]: https://github.com/tus/tus-node-server/tree/main/packages/s3-store
[`@tus/gcs-store`]: https://github.com/tus/tus-node-server/tree/main/packages/gcs-store
[`constants`]:
  https://github.com/tus/tus-node-server/blob/main/packages/utils/src/constants.ts
[`types`]: https://github.com/tus/tus-node-server/blob/main/packages/server/src/types.ts
[`models`]:
  https://github.com/tus/tus-node-server/blob/main/packages/utils/src/models/index.ts
[`kvstores`]:
  https://github.com/tus/tus-node-server/blob/main/packages/utils/src/kvstores/index.ts
[expiration]: https://tus.io/protocols/resumable-upload.html#expiration
[`Locker`]:
  https://github.com/tus/tus-node-server/blob/main/packages/utils/src/models/Locker.ts
[`MemoryLocker`]:
  https://github.com/tus/tus-node-server/blob/main/packages/server/src/lockers/MemoryLocker.ts
