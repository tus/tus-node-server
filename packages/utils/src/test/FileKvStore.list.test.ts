import {strict as assert} from 'node:assert'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {FileKvStore} from '../kvstores/FileKvStore.js'

describe('FileKvStore', () => {
  let directory: string
  let store: FileKvStore<{n: number}>

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-kvstore-'))
    store = new FileKvStore(directory)
  })

  afterEach(async () => {
    await fs.rm(directory, {recursive: true, force: true})
  })

  const touch = (...names: string[]) =>
    Promise.all(names.map((name) => fs.writeFile(path.join(directory, name), '')))

  describe('list', () => {
    it('ignores unpaired files', async () => {
      await touch('stray', 'orphan.json')
      assert.deepEqual(await store.list(), [])
    })

    it('lists ids that are prefixes of each other', async () => {
      await touch('id', 'id.json', 'id.j', 'id.j.json')
      assert.deepEqual(await store.list(), ['id', 'id.j'])
    })

    it('lists ids ending in .json', async () => {
      await touch('foo', 'foo.json', 'foo.json.json')
      assert.deepEqual(await store.list(), ['foo', 'foo.json'])
    })

    it('ignores leftover temp files', async () => {
      await touch('foo', 'foo.json', 'foo.json.abc.tmp')
      assert.deepEqual(await store.list(), ['foo'])
    })

    it('returns sorted ids', async () => {
      await touch('b', 'b.json', 'c', 'c.json', 'a', 'a.json')
      assert.deepEqual(await store.list(), ['a', 'b', 'c'])
    })
  })
})
