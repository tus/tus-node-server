import 'should'

import {strict as assert} from 'node:assert'
import fs from 'node:fs'
import fsProm from 'node:fs/promises'
import path from 'node:path'
import {Readable} from 'node:stream'

import sinon from 'sinon'

import {FileStore, FileConfigstore} from '@tus/file-store'
import {Upload} from '@tus/utils'

import * as shared from '../../../utils/dist/test/stores.js'

const fixturesPath = path.resolve('../', '../', 'test', 'fixtures')
const storePath = path.resolve('../', '../', 'test', 'output', 'file-store')

async function cleanup() {
  if (fs.existsSync(storePath)) {
    await fsProm.rm(storePath, {recursive: true})
    await fsProm.mkdir(storePath)
  }
}

describe('FileStore', function () {
  before(function () {
    this.testFileSize = 960_244
    this.testFileName = 'test.mp4'
    this.storePath = storePath
    this.testFilePath = path.resolve(fixturesPath, this.testFileName)
    this.filesDirectory = storePath
  })

  beforeEach(function () {
    sinon.spy(fs, 'mkdir')
    this.datastore = new FileStore({
      directory: this.storePath,
    })
  })

  this.afterEach(async () => {
    sinon.restore()
    await cleanup()
  })

  it('should create a directory for the files', function (done) {
    // @ts-expect-error should
    assert(fs.mkdir.calledOnce)
    // @ts-expect-error should
    assert.equal(this.datastore.directory, fs.mkdir.getCall(0).args[0])
    done()
  })

  describe('create', () => {
    const file = new Upload({id: '1234', size: 1000, offset: 0})

    it('should resolve when the directory exists', function () {
      return this.datastore.create(file).should.be.fulfilled()
    })

    it('should create an empty file', async function () {
      // TODO: this test would pass even if `datastore.create` would not create any file
      // as the file probably already exists from other tests
      await this.datastore.create(file)
      const stats = fs.statSync(path.join(this.datastore.directory, file.id))
      assert.equal(stats.size, 0)
    })

    it('should support nested upload IDs', async function () {
      const file = new Upload({id: 'nested/path/upload', size: 0, offset: 0})

      await this.datastore.create(file)
      assert.equal((await this.datastore.getUpload(file.id)).id, file.id)
      await this.datastore.remove(file.id)
    })

    it('should reject paths outside the configured directory', async function () {
      const outsidePath = path.resolve(this.datastore.directory, '..', 'outside-upload')
      const file = new Upload({id: '../outside-upload', size: 0, offset: 0})

      await assert.rejects(this.datastore.create(file), {status_code: 404})
      assert.equal(fs.existsSync(outsidePath), false)
    })
  })

  describe('write', function () {
    const file = new Upload({
      id: '1234',
      // @ts-expect-error todo
      size: this.testFileSize,
      offset: 0,
      metadata: {filename: 'world_domination_plan.pdf', is_confidential: null},
    })

    it("created file's size should match 'upload_length'", async function () {
      await this.datastore.create(file)
      await this.datastore.write(fs.createReadStream(this.testFilePath), file.id, 0)
      const stats = fs.statSync(this.testFilePath)
      assert.equal(stats.size, this.testFileSize)
    })

    it('should reject paths outside the configured directory', async function () {
      await assert.rejects(
        this.datastore.write(Readable.from('changed'), '../outside-upload', 0),
        {status_code: 404}
      )
    })
  })

  describe('getUpload', () => {
    it('should reject directories', function () {
      return this.datastore.getUpload('').should.be.rejected()
    })
  })

  describe('remove', () => {
    it('should not delete files outside the configured directory', async function () {
      const outsidePath = path.resolve(this.datastore.directory, '..', 'outside-victim')
      await fsProm.writeFile(outsidePath, 'keep me')

      try {
        await assert.rejects(this.datastore.remove('../outside-victim'), {
          status_code: 404,
        })
        assert.equal(await fsProm.readFile(outsidePath, 'utf8'), 'keep me')
      } finally {
        await fsProm.rm(outsidePath, {force: true})
      }
    })
  })

  describe('deleteExpired', () => {
    beforeEach(function () {
      this.datastore.expirationPeriodInMilliseconds = 60_000
    })

    const expiredUpload = (id: string, size = 10) =>
      new Upload({
        id,
        size,
        offset: 0,
        creation_date: new Date(Date.now() - 120_000).toISOString(),
      })

    it('skips listing when expiration is 0', async function () {
      this.datastore.expirationPeriodInMilliseconds = 0
      const list = sinon.stub(this.datastore.configstore, 'list').resolves([])

      assert.equal(await this.datastore.deleteExpired(), 0)
      assert.equal(list.called, false)
    })

    for (const [id, contents] of [
      ['completed', Buffer.from('completed upload')],
      ['nested/path/completed', Buffer.from('completed upload')],
      ['empty', Buffer.alloc(0)],
    ] as const) {
      it(`keeps completed upload ${id} after expiration`, async function () {
        await this.datastore.create(expiredUpload(id, contents.length))
        if (contents.length) {
          await this.datastore.write(Readable.from(contents), id, 0)
        }

        assert.equal(await this.datastore.deleteExpired(), 0)
        assert.equal((await this.datastore.getUpload(id)).offset, contents.length)
        assert.deepEqual(await fsProm.readFile(path.join(storePath, id)), contents)
      })
    }

    it('removes expired nested uploads and keeps unexpired uploads', async function () {
      const expired = new Upload({
        id: 'nested/path/expired',
        size: 10,
        offset: 0,
        creation_date: new Date(Date.now() - 120_000).toISOString(),
      })
      const fresh = new Upload({id: 'nested/path/fresh', size: 10, offset: 0})
      await this.datastore.create(expired)
      await this.datastore.create(fresh)

      assert.equal(await this.datastore.deleteExpired(), 1)
      await assert.rejects(fsProm.stat(path.join(storePath, expired.id)), {
        code: 'ENOENT',
      })
      await assert.rejects(fsProm.stat(path.join(storePath, `${expired.id}.json`)), {
        code: 'ENOENT',
      })
      assert.equal((await this.datastore.getUpload(fresh.id)).id, fresh.id)
    })

    for (const suffix of ['', '.json']) {
      it(`continues cleanup when missing${suffix} disappears after listing`, async function () {
        for (const id of ['missing', 'remaining']) {
          await this.datastore.create(expiredUpload(id))
        }
        const store = this.datastore.configstore
        const list = store.list.bind(store)
        sinon.stub(store, 'list').callsFake(async () => {
          const ids = await list()
          await fsProm.rm(path.join(storePath, `missing${suffix}`))
          return ids
        })

        assert.equal(await this.datastore.deleteExpired(), 1)
        await assert.rejects(fsProm.stat(path.join(storePath, 'remaining')), {
          code: 'ENOENT',
        })
      })
    }

    it('continues cleanup when an upload disappears before removal', async function () {
      for (const id of ['missing', 'remaining']) {
        await this.datastore.create(expiredUpload(id))
      }
      const remove = this.datastore.remove.bind(this.datastore)
      sinon.stub(this.datastore, 'remove').callsFake(async (id: unknown) => {
        if (id === 'missing') {
          await fsProm.rm(path.join(storePath, id))
        }
        return remove(id as string)
      })

      assert.equal(await this.datastore.deleteExpired(), 1)
      await assert.rejects(fsProm.stat(path.join(storePath, 'remaining')), {
        code: 'ENOENT',
      })
    })

    for (const lstatFails of [false, true]) {
      it(`rejects when removal fails and ${lstatFails ? 'the file check fails' : 'the file remains'}`, async function () {
        await this.datastore.create(expiredUpload('locked'))
        const error = Object.assign(new Error('EIO'), {code: 'EIO'})
        sinon.stub(fsProm, 'unlink').rejects(error)
        if (lstatFails) {
          sinon.stub(fsProm, 'lstat').rejects(error)
        }

        await assert.rejects(
          this.datastore.deleteExpired(),
          lstatFails ? (thrown) => thrown === error : {status_code: 404}
        )
        await fsProm.stat(path.join(storePath, 'locked'))
      })
    }
  })

  describe('FileConfigstore', () => {
    it('should ignore random files in directory when calling list()', async () => {
      const store = new FileConfigstore(storePath)
      const files = ['tus', 'tus.json', 'tu', 'tuss.json', 'random']
      for (const file of files) {
        await fsProm.writeFile(path.resolve(storePath, file), '')
      }
      const list = await store.list()

      // list returns the amount of uploads.
      // One upload consists of the file and the JSON info file.
      // But from the list perspective that is only one upload.
      assert.strictEqual(list.length, 1)
    })

    it('should not access files outside the configured directory', async () => {
      const store = new FileConfigstore(storePath)
      const outsidePath = path.resolve(storePath, '..', 'outside-config.json')
      await fsProm.writeFile(outsidePath, '{"original":true}')

      try {
        assert.equal(await store.get('../outside-config'), undefined)
        await assert.rejects(
          store.set('../outside-config', new Upload({id: 'outside', size: 0, offset: 0}))
        )
        await assert.rejects(store.delete('../outside-config'))
        assert.equal(await fsProm.readFile(outsidePath, 'utf8'), '{"original":true}')
      } finally {
        await fsProm.rm(outsidePath, {force: true})
      }
    })
  })

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  shared.shouldRemoveUploads() // Termination extension
  shared.shouldExpireUploads() // Expiration extension
  shared.shouldWriteUploads()
  shared.shouldHandleOffset()
  shared.shouldDeclareUploadLength() // Creation-defer-length extension
})
