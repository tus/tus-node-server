import path from 'node:path'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'

import sinon from 'sinon'

import S3Store from '../lib/stores/S3Store'
import * as shared from './Test-Stores.shared'
import Upload from '../lib/models/Upload'

describe('S3DataStore', function () {
  before(function () {
    this.testFileSize = 960_244
    this.testFileName = 'test.mp4'
    this.storePath = '/test/output'
    this.testFilePath = path.resolve('test', 'fixtures', this.testFileName)
  })
  beforeEach(function () {
    this.datastore = new S3Store({
      bucket: process.env.AWS_BUCKET as string,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
      region: process.env.AWS_REGION,
      partSize: 8 * 1024 * 1024, // Each uploaded part will have ~8MB,
    })
  })

  it('should correctly prepend a buffer to a file', async function () {
    const path = 'test/fixtures/foo.txt'
    await fs.writeFile(path, 'world!')
    await this.datastore.prependIncompletePart(path, Buffer.from('Hello, '))
    assert(await fs.readFile(path, 'utf8'), 'Hello, world!')
    await fs.unlink(path)
  })

  it('should store in between chunks under the minimum part size and prepend it to the next call', async function () {
    const store = this.datastore
    const size = 4 * 1024 * 1024
    const incompleteSize = 1024 * 1024
    const getIncompletePart = sinon.spy(store, 'getIncompletePart')
    const deleteIncompletePart = sinon.spy(store, 'deleteIncompletePart')
    const uploadIncompletePart = sinon.spy(store, 'uploadIncompletePart')
    const uploadPart = sinon.spy(store, 'uploadPart')
    const upload = new Upload({
      id: 'incomplete-part-test',
      size: size + incompleteSize,
      offset: 0,
    })

    await store.create(upload)
    await store.write(Readable.from(Buffer.alloc(incompleteSize)), upload.id)
    await store.write(Readable.from(Buffer.alloc(size)), upload.id)
    const {offset} = await store.getUpload(upload.id)

    assert.equal(getIncompletePart.calledTwice, true)
    assert.equal(deleteIncompletePart.calledOnce, true)
    assert.equal(uploadIncompletePart.calledOnce, true)
    assert.equal(uploadPart.calledOnce, true)
    assert.equal(offset, size + incompleteSize)
  })

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  // Termination extension not implemented yet
  // shared.shouldRemoveUploads()
  shared.shouldWriteUploads()
  shared.shouldHandleOffset()
  shared.shouldDeclareUploadLength() // Creation-defer-length extension
})
