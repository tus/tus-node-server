# `@tus/azure-store`

> 👉 **Note**: Azure Store upload is implemented using the TUS protocol. It uses Append Blob Client [Azure Blob AppendBlobClient](https://learn.microsoft.com/en-us/rest/api/storageservices/append-block) to upload the files in multiple blocks. Currently there is no support for stream in Azure Node SDK, so this implementation concatenates all the chunks in a single
PATCH request into a block and append that block to the blob storage using the appendBlock method.

## Contents

- [Install](#install)
- [Use](#use)
- [API](#api)
  - [`new FileStore(options)`](#new-filestoreoptions)
- [Extensions](#extensions)
- [Examples](#examples)
  - [Example: creating your own config store](#example-creating-your-own-config-store)
- [Types](#types)
- [Compatibility](#compatibility)
- [Contribute](#contribute)
- [License](#license)

## Install

In Node.js (16.0+), install with npm:

```bash
npm install @tus/azure-store
```

## Use

```js
const {Server} = require('@tus/server')
const {FileStore} = require('@tus/azure-store')

const server = new Server({
  path: '/files',
  datastore: new AzureStore({
    account: 'your azure storage account',
    accountKey: 'your azure storage account key',
    containerName: 'your azure storage container name',
  }),
})
// ...
```

## API

This package exports `AzureStore`. There is no default export.

### `new AzureStore(options)`

Creates a new azure store with options.

#### `options.account`
Your Azure storage account should go here (`string`).

#### `options.accountKey`
Your Azure storage account key should go here (`string`).

#### `options.containerName`
Your Azure storage container name to store the files should go here. (`string`).

#### `options.cache`
Provide your own cache solution for the metadata of uploads ([`KvStore`][]) to reduce the calls to storage server. 
Default is ([`MemoryKvStore`][]) which stores the data in memory.


## Extensions

The tus protocol supports optional [extensions][]. Below is a table of the supported
extensions in `@tus/Azure-store`. More will be added in the future releases.

| Extension                | `@tus/file-store` |
| ------------------------ | ----------------- |
| [Creation][]             | ✅                |
| [Creation With Upload][] | ❌                |
| [Expiration][]           | ❌                |
| [Checksum][]             | ❌                |
| [Termination][]          | ❌                |
| [Concatenation][]        | ✅                |

## Examples

### Example: creating your own config store

For demonstration purposes we will create a memory config store, It's written in TypeScript.

```ts
import type {Upload} from '@tus/server'

export class MemoryConfigstore {
  data: Map<string, Upload> = new Map()

  get(key: string): Upload | undefined {
    return this.data.get(key)
  }

  set(key: string, value: Upload) {
    this.data.set(key, value)
  }

  delete(key: string) {
    return this.data.delete(key)
  }

  get list(): Record<string, Upload> {
    return Object.fromEntries(this.data.entries())
  }
}
```

Then use it:

```js
import {MemoryConfigstore} from './MemoryConfigstore'

const store = new AzureStore({
    account: 'your azure storage account',
    accountKey: 'your azure storage account key',
    containerName: 'your azure storage container name',
    cache: new MemoryConfigstore(),
  
  }),


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
[`cleanUpExpiredUploads`]:
  https://github.com/tus/tus-node-server/tree/main/packages/server#cleanupexpireduploads
[kvstores]: https://github.com/tus/tus-node-server/tree/main/packages/server#kvstores
[`KvStore`]:
  https://github.com/tus/tus-node-server/blob/main/packages/utils/src/kvstores/Types.ts

[`MemoryKvStore`]:
  https://github.com/tus/tus-node-server/blob/main/packages/utils/src/kvstores/MemoryKvStore.ts
