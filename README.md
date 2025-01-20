# tus-node-server

<img alt="Tus logo" src="https://github.com/tus/tus.io/blob/main/public/images/tus1.png?raw=true" width="30%" align="right" />

> **tus** is a protocol based on HTTP for _resumable file uploads_. Resumable means that
> an upload can be interrupted at any moment and can be resumed without re-uploading the
> previous data again. An interruption may happen willingly, if the user wants to pause,
> or bn accident in case of an network issue or server outage.

tus-node-server is an official implementation of the
[tus resumable upload protocol](http://www.tus.io/protocols/resumable-upload.html). The
protocol specifies a flexible method to upload files to remote servers using HTTP. The
special feature is the ability to pause and resume uploads at any moment allowing to
continue seamlessly after e.g. network interruptions.

It is capable of accepting uploads with arbitrary sizes and storing them locally on disk,
on Google Cloud Storage or on AWS S3 (or any other S3-compatible storage system). Due to
its modularization and extensibility, support for nearly any other cloud provider could
easily be added to tus-node-server

> 📣
> [**Read the 1.0.0 announcement post: new packages, rewrite in TypeScript, and much more**](https://tus.io/blog/2023/09/04/tus-node-server-v100).

## Contents

- [When should I use this?](#when-should-i-use-this)
- [Quick start](#quick-start)
- [Packages](#packages)
- [Extensions](#extensions)
- [Types](#types)
- [Compatibility](#compatibility)
- [Contribute](#contribute)
- [License](#license)

## When should I use this?

When you want reliable, resumable uploads. Together with a client like
[tus-js-client](https://github.com/tus/tus-js-client) or [Uppy](https://uppy.io), you'll
have a plug-and-play experience.

tus-node-server in particular makes sense if you want to host a Node.js server or
integrate it into your existing one. There are also other mature servers, like
[tusd](https://github.com/tus/tusd), [tusdotnet](https://github.com/tusdotnet/tusdotnet),
[rustus](https://github.com/s3rius/rustus), and
[many others](https://tus.io/implementations.html).

## Quick start

A standalone server which stores files on disk.

> [!TIP]
> Try it yourself in [StackBlitz](https://stackblitz.com/edit/stackblitz-starters-zg6mgnuf?file=index.js)

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

A tus server integrated into your existing Node.js server. `@tus/server` has no
dependencies so it can be integrated in any server-side framework. More examples can be
found in [`@tus/server`][].

```js
const fastify = require('fastify')({ logger: true });
const {Server} = require('@tus/server');
const {FileStore} = require('@tus/file-store');

const tusServer = new Server({
  path: '/files',
  datastore: new FileStore({ directory: './files' })
})

fastify.addContentTypeParser(
    'application/offset+octet-stream', (request, payload, done) => done(null);
);
fastify.all('/files', (req, res) => {
    tusServer.handle(req.raw, res.raw);
});
fastify.all('/files/*', (req, res) => {
    tusServer.handle(req.raw, res.raw);
});
fastify.listen(3000, (err) => {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
});
```

## Packages

- [`@tus/server`][]. The tus server. Standalone or integrate it into your Node.js server.
- [`@tus/file-store`][]. Store files on disk.
- [`@tus/s3-store`][]. Store files on AWS S3.
- [`@tus/gcs-store`][]. Store files on Google Cloud Storage.
- [`@tus/azure-store`][]. Store files on Azure.

## Extensions

The tus protocol supports optional [extensions][]. Below is a table of the supported
extensions.

| Extension                | [`file-store`][`@tus/file-store`] | [`s3-store`][`@tus/s3-store`] | [`gcs-store`][`@tus/gcs-store`] | [`azure-store`][`@tus/azure-store`] |
| ------------------------ | --------------------------------- | ----------------------------- | ------------------------------- | ----------------------------------- |
| [Creation][]             | ✅                                | ✅                            | ✅                              | ✅                                  |
| [Creation With Upload][] | ✅                                | ✅                            | ✅                              | ✅                                  |
| [Expiration][]           | ✅                                | ✅                            | ❌                              | ❌                                  |
| [Checksum][]             | ❌                                | ❌                            | ❌                              | ❌                                  |
| [Termination][]          | ✅                                | ✅                            | ❌                              | ❌                                  |
| [Concatenation][]        | ❌                                | ❌                            | ❌                              | ❌                                  |

## Types

All packages are fully typed with TypeScript.

## Compatibility

All packages require Node.js 16.0+.

## Contribute

See
[`contributing.md`](https://github.com/tus/tus-node-server/blob/main/.github/contributing.md).

## License

[MIT](https://github.com/tus/tus-node-server/blob/master/license) ©
[tus](https://github.com/tus)

[corepack]: https://nodejs.org/api/corepack.html
[`@tus/server`]: https://github.com/tus/tus-node-server/tree/main/packages/server
[`@tus/file-store`]: https://github.com/tus/tus-node-server/tree/main/packages/file-store
[`@tus/s3-store`]: https://github.com/tus/tus-node-server/tree/main/packages/s3-store
[`@tus/gcs-store`]: https://github.com/tus/tus-node-server/tree/main/packages/gcs-store
[`@tus/azure-store`]: https://github.com/tus/tus-node-server/tree/main/packages/azure-store
[extensions]: https://tus.io/protocols/resumable-upload.html#protocol-extensions
[creation]: https://tus.io/protocols/resumable-upload.html#creation
[creation with upload]:
  https://tus.io/protocols/resumable-upload.html#creation-with-upload
[expiration]: https://tus.io/protocols/resumable-upload.html#expiration
[checksum]: https://tus.io/protocols/resumable-upload.html#checksum
[termination]: https://tus.io/protocols/resumable-upload.html#termination
[concatenation]: https://tus.io/protocols/resumable-upload.html#concatenation
