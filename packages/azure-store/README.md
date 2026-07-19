# `@tus/azure-store`

Azure Store based on the Append Blob Client [Azure Blob AppendBlobClient](https://learn.microsoft.com/en-us/rest/api/storageservices/append-block).

## Contents

- [Install](#install)
- [Use](#use)
- [API](#api)
  - [`new AzureStore(options)`](#new-azurestoreoptions)
- [Extensions](#extensions)
- [Types](#types)
- [Compatibility](#compatibility)
- [Contribute](#contribute)
- [License](#license)

## Install

In Node.js >=20.19.0, install with npm:

```bash
npm install @tus/azure-store
```

## Use

```js
import { Server } from "@tus/server";
import { AzureStore } from "@tus/azure-store";

const server = new Server({
  path: "/files",
  datastore: new AzureStore({
    account: process.env.AZURE_ACCOUNT_ID,
    accountKey: process.env.AZURE_ACCOUNT_KEY,
    containerName: process.env.AZURE_CONTAINER_NAME,
  }),
});
// ...
```

Alternatively, construct a [`ContainerClient`][] yourself to use any
authentication method supported by the Azure SDK:

```js
import { DefaultAzureCredential } from "@azure/identity";
import { ContainerClient } from "@azure/storage-blob";
import { Server } from "@tus/server";
import { AzureStore } from "@tus/azure-store";

const account = process.env.AZURE_ACCOUNT_ID;
const container = process.env.AZURE_CONTAINER_NAME;
const containerClient = new ContainerClient(
  `https://${account}.blob.core.windows.net/${container}`,
  new DefaultAzureCredential(),
);

const server = new Server({
  path: "/files",
  datastore: new AzureStore({ containerClient }),
});
// ...
```

## API

This package exports `AzureStore`. There is no default export.

### `new AzureStore(options)`

Creates a new azure store with options.

#### `options.account`

Azure account ID (`string`).

#### `options.accountKey`

Azure account key (`string`).

#### `options.containerName`

Azure storage container name (`string`).

#### `options.containerClient`

An Azure [`ContainerClient`][] configured by the consumer. Use this instead of
`account`, `accountKey`, and `containerName` to configure authentication,
connection details, and the Azure SDK pipeline yourself.

#### `options.cache`

Provide your own cache solution for the metadata of uploads ([`KvStore`][]) to reduce the calls to storage server.
Default is ([`MemoryKvStore`][]) which stores the data in memory.

## Extensions

The tus protocol supports optional [extensions][]. Below is a table of the supported
extensions in `@tus/azure-store`. More will be added in the future releases.

| Extension                | `@tus/file-store` |
| ------------------------ | ----------------- |
| [Creation][]             | ✅                |
| [Creation With Upload][] | ✅                |
| [Expiration][]           | ❌                |
| [Checksum][]             | ❌                |
| [Termination][]          | ❌                |
| [Concatenation][]        | ❌                |

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
[`cleanUpExpiredUploads`]: https://github.com/tus/tus-node-server/tree/main/packages/server#cleanupexpireduploads
[kvstores]: https://github.com/tus/tus-node-server/tree/main/packages/server#kvstores
[`KvStore`]: https://github.com/tus/tus-node-server/blob/main/packages/utils/src/kvstores/Types.ts
[`MemoryKvStore`]: https://github.com/tus/tus-node-server/blob/main/packages/utils/src/kvstores/MemoryKvStore.ts
[`ContainerClient`]: https://learn.microsoft.com/javascript/api/@azure/storage-blob/containerclient
