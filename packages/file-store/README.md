# `@tus/file-store`

> 👉 **Note**: since 1.0.0 packages are split and published under the `@tus` scope.
> The old package, `tus-node-server`, is considered unstable and will only receive security fixes.
> Make sure to use the new packages, currently in beta at `1.0.0-beta.1`.

## Contents

- [Install](#install)
- [Use](#use)
- [API](#api)
  - [`new FileStore(options)`](#new-filestoreoptions)
- [Examples](#examples)
  - [Example: creating your own config store](#example-creating-your-own-config-store)
- [Types](#types)
- [Compatibility](#compatibility)
- [Contribute](#contribute)
- [License](#license)

## Install

In Node.js (16.0+), install with npm:

```bash
npm install @tus/file-store
```

## Use

```js
const {Server} = require('@tus/server')
const {FileStore} = require('@tus/file-store')

const server = new Server({
  path: '/files',
  datastore: new FileStore({directory: './some/path'}),
})
// ...
```

## API

This package exports `FileStore`. There is no default export.

### `new FileStore(options)`

Creates a new file store with options.

#### `directory`

The directory to store the files on disk.

#### `configstore`

Provide your own storage solution for the metadata of uploads. Default uses [`configstore`](https://www.npmjs.com/package/configstore).

## Examples

### Example: creating your own config store

For demonstration purposes we will create a memory config store, but that's not a good idea.
It's written in TypeScript.

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

  get all(): Record<string, Upload> {
    return Object.fromEntries(this.data.entries())
  }
}
```

Then use it:

```js
import {MemoryConfigstore} from './MemoryConfigstore'

const store = new FileStore({directory: './some/path', configstore: MemoryConfigstore}),
```

## Types

This package is fully typed with TypeScript.

## Compatibility

This package requires Node.js 16.0+.

## Contribute

See [`contributing.md`](https://github.com/tus/tus-node-server/blob/main/.github/contributing.md).

## License

[MIT](https://github.com/tus/tus-node-server/blob/master/license) © [tus](https://github.com/tus)
