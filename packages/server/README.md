# `@tus/server`

> 👉 **Note**: since 1.0.0 packages are split and published under the `@tus` scope.
> The old package, `tus-node-server`, is considered unstable and will only receive security fixes.
> Make sure to use the new packages, currently in beta at `1.0.0-beta.1`.

## Contents

- [Install](#install)
- [Use](#use)
- [API](#api)
  - [`new Server(options)`](#new-serveroptions)
  - [`EVENTS`](#events)
- [Examples](#examples)
  - [Example: validate metadata when an upload is created](#example-validate-metadata-when-an-upload-is-created)
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

new Server({
  path: '/files',
  datastore: new FileStore({directory: './files'}),
}).listen({host, port}, () => {
  console.log(
    `[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port}`
  )
})
```

## API

This package exports `Server` and all [`constants`][], [`types`][], and [`models`][]. There is no default export.
You should only need the `Server` and `EVENTS` exports.

### `new Server(options)`

Creates a new tus server with options.

#### `path`

The route to accept requests (`string`).

#### `relativeLocation`

Return a relative URL as the `Location` header to the client (`boolean`).

#### `respectForwardedHeaders`

Allow `Forwarded`, `X-Forwarded-Proto`, and `X-Forwarded-Host` headers to override the `Location` header returned by the server (`boolean`).

#### `namingFunction`

Control how you want to name files (`(req) => string`)

It is important to make these unique to prevent data loss. Only use it if you need to.
Default uses `crypto.randomBytes(16).toString('hex')`.

#### `onUploadCreate`

`onUploadCreate` will be invoked before a new upload is created. (`(req, res, upload) => Promise<res>`).

If the function returns the (modified) response, the upload will be created.
If an error is thrown, the HTTP request will be aborted and the provided `body` and `status_code` (or their fallbacks) will be sent to the client.

This can be used to implement validation of upload metadata or add headers.

#### `onUploadFinish`

`onUploadFinish` will be invoked after an upload is completed but before a response is returned to the client (`(req, res, upload) => Promise<res>`).

If the function returns the (modified) response, the upload will finish.
If an error is thrown, the HTTP request will be aborted and the provided `body` and `status_code` (or their fallbacks) will be sent to the client.

This can be used to implement post-processing validation.

### `EVENTS`

Events to subscribe to (`Object<string>`).

You can listen for events by using the `.on()` method on the `Server` instance.

#### `POST_CREATE`

Called after an upload has been created but before it's written to a store.

```js
const {EVENTS} = require('@tus/server')
// ...
server.on(EVENTS.POST_CREATE, (req ,res, upload => {})
```

#### `POST_RECEIVE`

Called every time a `PATCH` request is handled.

```js
const {EVENTS} = require('@tus/server')
// ...
server.on(EVENTS.POST_RECEIVE, (req ,res, upload => {})
```

#### `POST_FINISH`

Called an upload has completed and after a response has been sent to the client.

```js
const {EVENTS} = require('@tus/server')
// ...
server.on(EVENTS.POST_FINISH, (req ,res, upload => {})
```

#### `POST_TERMINATE`

Called after an upload has been terminated and a response has been sent to the client.

```js
const {EVENTS} = require('@tus/server')
// ...
server.on(EVENTS.POST_TERMINATE, (req ,res, id => {})
```

## Examples

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

server.listen({host, port})
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
