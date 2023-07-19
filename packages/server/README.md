# `@tus/server`

> 👉 **Note**: since 1.0.0 packages are split and published under the `@tus` scope.
> The old package, `tus-node-server`, is considered unstable and will only receive security fixes.
> Make sure to use the new package, currently in beta at `1.0.0-beta.7`.

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
const { Server } = require("@tus/server");
const { FileStore } = require("@tus/file-store");
const host = "127.0.0.1";
const port = 1080;

const server = new Server({
  path: "/files",
  datastore: new FileStore({ directory: "./files" }),
});
server.listen({ host, port });
```

## API

This package exports `Server` and all [`constants`][], [`types`][], and [`models`][]. There is no default export.
You should only need the `Server` and `EVENTS` exports.

### `new Server(options)`

Creates a new tus server with options.

#### `options.path`

The route to accept requests (`string`).

#### `options.relativeLocation`

Return a relative URL as the `Location` header to the client (`boolean`).

#### `options.respectForwardedHeaders`

Allow `Forwarded`, `X-Forwarded-Proto`, and `X-Forwarded-Host` headers to override the `Location` header returned by the server (`boolean`).

#### `options.namingFunction`

Control how you want to name files (`(req) => string`)

It is important to make these unique to prevent data loss. Only use it if you need to.
Default uses `crypto.randomBytes(16).toString('hex')`.

#### `options.onUploadCreate`

`onUploadCreate` will be invoked before a new upload is created. (`(req, res, upload) => Promise<res>`).

If the function returns the (modified) response, the upload will be created.
If an error is thrown, the HTTP request will be aborted and the provided `body` and `status_code` (or their fallbacks) will be sent to the client.

This can be used to implement validation of upload metadata or add headers.

#### `options.onUploadFinish`

`onUploadFinish` will be invoked after an upload is completed but before a response is returned to the client (`(req, res, upload) => Promise<res>`).

If the function returns the (modified) response, the upload will finish.
If an error is thrown, the HTTP request will be aborted and the provided `body` and `status_code` (or their fallbacks) will be sent to the client.

This can be used to implement post-processing validation.

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

## Examples

### Example: integrate tus into Express

```js
const { Server } = require("@tus/server");
const { FileStore } = require("@tus/file-store");
const express = require("express");

const host = "127.0.0.1";
const port = 1080;
const app = express();
const uploadApp = express();
const server = new Server({
  datastore: new FileStore({ directory: "/files" }),
});

uploadApp.all("*", server.handle.bind(server));
app.use("/uploads", uploadApp);
app.listen(port, host);
```

### Example: integrate tus into Koa

```js
const http = require("node:http");
const url = require("node:url");
const Koa = require("koa");
const { Server } = require("@tus/server");
const { FileStore } = require("@tus/file-store");

const app = new Koa();
const appCallback = app.callback();
const port = 1080;
const tusServer = new Server({
  path: "/files",
  datastore: new FileStore({ directory: "/files" }),
});

const server = http.createServer((req, res) => {
  const urlPath = url.parse(req.url).pathname;

  // handle any requests with the `/files/*` pattern
  if (/^\/files\/.+/.test(urlPath.toLowerCase())) {
    return tusServer.handle(req, res);
  }

  appCallback(req, res);
});

server.listen(port);
```

### Example: integrate tus into Fastify

```js
const fastify = require("fastify")({ logger: true });
const { Server } = require("@tus/server");
const { FileStore } = require("@tus/file-store");

const tusServer = new Server({
  path: "/files",
  datastore: new FileStore({ directory: "./files" }),
});

/**
 * add new content-type to fastify forewards request
 * without any parser to leave body untouched
 * @see https://www.fastify.io/docs/latest/Reference/ContentTypeParser/
 */
fastify.addContentTypeParser(
  "application/offset+octet-stream",
  (request, payload, done) => done(null)
);

/**
 * let tus handle preparation and filehandling requests
 * fastify exposes raw nodejs http req/res via .raw property
 * @see https://www.fastify.io/docs/latest/Reference/Request/
 * @see https://www.fastify.io/docs/latest/Reference/Reply/#raw
 */
fastify.all("/files", (req, res) => {
  tusServer.handle(req.raw, res.raw);
});
fastify.all("/files/*", (req, res) => {
  tusServer.handle(req.raw, res.raw);
});
fastify.listen(3000, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
```

### Example: integrate tus into Next.js

Attach the tus server handler to a Next.js route handler in an [optional catch-all route file](https://nextjs.org/docs/routing/dynamic-routes#optional-catch-all-routes)

`/pages/api/upload/[[...file]].ts`

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Server, Upload } from "@tus/server";
import { FileStore } from "@tus/file-store";

/**
 * !Important. This will tell Next.js NOT Parse the body as tus requires
 * @see https://nextjs.org/docs/api-routes/request-helpers
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

const tusServer = new Server({
  // `path` needs to match the route declared by the next file router
  // ie /api/upload
  path: "/api/upload",
  datastore: new FileStore({ directory: "./files" }),
});

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return tusServer.handle(req, res);
}
```

### Example: validate metadata when an upload is created

```js
const { Server } = require("@tus/server");
// ...

const server = new Server({
  // ..
  async onUploadCreate(req, res, upload) {
    const { ok, expected, received } = validateMetadata(upload);
    if (!ok) {
      const body = `Expected "${expected}" in "Upload-Metadata" but received "${received}"`;
      throw { status_code: 500, body }; // if undefined, falls back to 500 with "Internal server error".
    }
    // We have to return the (modified) response.
    return res;
  },
});

server.listen({ host, port });
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
[expiration]: https://tus.io/protocols/resumable-upload.html#expiration
