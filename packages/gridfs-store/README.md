# @tus/gridfs-store

> Mongo GridFs store for [tus](https://tus.io)

## Contents

- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Supported extensions](#supported-extensions)
- [Types](#types)
- [Compatibility](#compatibility)
- [Contribute](#contribute)
- [License](#license)

## Install

In Node.js (16.0+), install with npm:

```bash
npm install @tus/gridfs-store
```

## Usage

```js
const {Server} = require('@tus/server')
const {GridFsStore} = require('@tus/gridfs-store')

const store = new GridFsStore({
  mongoUrl: 'mongodb://localhost:27017/mydb',
  bucketName: 'myfiles',
  chunkSizeBytes: 1024 * 1024, // 1 MiB chunks
})

const server = new Server({
  datastore: store,
})

server.listen(8080)
```

This package comes with a mongoConfigStore that stores the metadata in a MongoDB collection. You can use it  separately with the fileStore as follows:

```js
const {Server} = require('@tus/server')
const {FileStore} = require('@tus/file-store')
const {MongoClient} = require('mongodb')

const { MongodbConfigStore} = require('@tus/gridfs-store')
const mongoClient = new MongoClient('mongodb://localhost:27017/mydb')
const configStore = new MongodbConfigStore({mongo: mongoClient.db('mydb')})

const store = new FileStore({directory: './some/path', configstore: configStore}),

```

## API

### `GridFsStore(options)`

Creates a new GridFsStore instance.

**Options**

- `mongoUrl` - The MongoDB connection URL. Default: `'mongodb://localhost:27017/test'`
- `bucketName` - The GridFS bucket name to use. Default: `'fs'`
- `chunkSizeBytes` - The GridFS chunk size in bytes. Default: `261120` (255 KiB)
- `expirationPeriodinMs` - The time before an _ongoing_ upload is considered expired (`number`).

### `MongodbConfigStore(options)`
Creates a new MongodbConfigStore instance.

**Options**
- collectionName - The name of the collection to use. Default: `'upload_config_store'`
- mongo - an instance of the mongo's Db class


## Supported extensions

| Extension                | Supported |
| ------------------------ | --------- |
| [Creation][]             | ✅        |
| [Creation With Upload][] | ✅        |
| [Expiration][]           | ✅        |
| [Checksum][]             | ❌        |
| [Termination][]          | ✅        |
| [Concatenation][]        | ❌        |

## Types

This package is fully typed with TypeScript.

## Compatibility

This package requires Node.js 16.0+.

## Contribute

See [`contributing.md`](https://github.com/tus/tus-node-server/blob/main/.github/contributing.md).

## License

[MIT](https://github.com/tus/tus-node-server/blob/master/license) © [tus](https://github.com/tus)

[Creation]: https://tus.io/protocols/resumable-upload.html#creation
[Creation With Upload]: https://tus.io/protocols/resumable-upload.html#creation-with-upload
[Expiration]: https://tus.io/protocols/resumable-upload.html#expiration
[Checksum]: https://tus.io/protocols/resumable-upload.html#checksum
[Termination]: https://tus.io/protocols/resumable-upload.html#termination
[Concatenation]: https://tus.io/protocols/resumable-upload.html#concatenation
