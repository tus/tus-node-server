import path from 'node:path'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'

import sinon from 'sinon'

import {S3Store} from '../src'
import * as shared from 'test/stores.test'
import {Upload} from '@tus/utils'

const fixturesPath = path.resolve('../', '../', 'test', 'fixtures')
const storePath = path.resolve('../', '../', 'test', 'output', 's3-store')

describe('S3DataStore', () => {
  before(function () {
    this.testFileSize = 960_244
    this.testFileName = 'test.mp4'
    this.storePath = storePath
    this.testFilePath = path.resolve(fixturesPath, this.testFileName)
  })
  beforeEach(function () {
    this.datastore = new S3Store({
      partSize: 8 * 1024 * 1024, // Each uploaded part will have ~8MiB,
      s3ClientConfig: {
        bucket: process.env.AWS_BUCKET as string,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
        },
        region: process.env.AWS_REGION,
      },
    })
  })

  it('calculated part size for deferred lenght should be finite', async function () {
    const store = this.datastore

    assert.strictEqual(Number.isFinite(store.calcOptimalPartSize(undefined)), true)
  })

  it('should store in between chunks under the minimum part size and prepend it to the next call', async function () {
    const store = this.datastore
    const size = 1024
    const incompleteSize = 1024
    const getIncompletePart = sinon.spy(store, 'getIncompletePart')
    const deleteIncompletePart = sinon.spy(store, 'deleteIncompletePart')
    const uploadIncompletePart = sinon.spy(store, 'uploadIncompletePart')
    const uploadPart = sinon.spy(store, 'uploadPart')
    const upload = new Upload({
      id: shared.testId('incomplete-part-test'),
      size: size + incompleteSize,
      offset: 0,
    })

    await store.create(upload)
    const n1 = await store.write(
      Readable.from(Buffer.alloc(incompleteSize)),
      upload.id,
      upload.offset
    )
    assert.equal(n1, incompleteSize)
    const n2 = await store.write(Readable.from(Buffer.alloc(size)), upload.id, n1)
    assert.equal(n2, incompleteSize + size)
    const {offset} = await store.getUpload(upload.id)
    assert.equal(getIncompletePart.calledTwice, true)
    assert.equal(deleteIncompletePart.calledOnce, true)
    assert.equal(uploadIncompletePart.calledOnce, true)
    assert.equal(uploadPart.calledOnce, true)
    assert.equal(offset, size + incompleteSize)
  })

  it('store shuld return proper offset when incomplete part exists', async function () {
    const store = this.datastore
    const size = 4096
    const incompleteSize = 1024
    const upload = new Upload({
      id: shared.testId('incomplete-part-test'),
      size: size + incompleteSize,
      offset: 0,
    })

    await store.create(upload)

    {
      const {offset} = await store.getUpload(upload.id)
      assert.equal(offset, 0)
    }

    {
      const offset = await store.write(
        Readable.from(Buffer.alloc(incompleteSize)),
        upload.id,
        upload.offset
      )
      assert.equal(offset, incompleteSize)
    }

    {
      const {offset} = await store.getUpload(upload.id)
      assert.equal(offset, incompleteSize)
    }
  })

  it('upload as multipart upload when incomplete part grows beyond minimal part size', async function () {
    const store = this.datastore
    const size = 10 * 1024 * 1024 // 10MiB
    const incompleteSize = 2 * 1024 * 1024 // 2MiB
    const getIncompletePart = sinon.spy(store, 'getIncompletePart')
    const uploadIncompletePart = sinon.spy(store, 'uploadIncompletePart')
    const uploadPart = sinon.spy(store, 'uploadPart')
    const upload = new Upload({
      id: shared.testId('incomplete-part-test'),
      size: size + incompleteSize,
      offset: 0,
    })

    let offset = upload.offset

    await store.create(upload)
    offset = await store.write(
      Readable.from(Buffer.alloc(incompleteSize)),
      upload.id,
      offset
    )
    offset = await store.write(
      Readable.from(Buffer.alloc(incompleteSize)),
      upload.id,
      offset
    )

    assert.equal(getIncompletePart.called, true)
    assert.equal(uploadIncompletePart.called, true)
    assert.equal(uploadPart.called, false)

    await store.write(Readable.from(Buffer.alloc(incompleteSize)), upload.id, offset)

    assert.equal(uploadPart.called, true)
  })

  it('should process chunk size of exactly the min size', async function () {
    this.datastore.minPartSize = 1024 * 1024 * 5
    const store = this.datastore
    const size = 1024 * 1024 * 5
    const getIncompletePart = sinon.spy(store, 'getIncompletePart')
    const deleteIncompletePart = sinon.spy(store, 'deleteIncompletePart')
    const uploadIncompletePart = sinon.spy(store, 'uploadIncompletePart')
    const uploadPart = sinon.spy(store, 'uploadPart')
    const upload = new Upload({
      id: shared.testId('min-part-size-test'),
      size: size + size,
      offset: 0,
    })

    await store.create(upload)
    const n1 = await store.write(
      Readable.from(Buffer.alloc(size)),
      upload.id,
      upload.offset
    )
    assert.equal(n1, size)
    const n2 = await store.write(Readable.from(Buffer.alloc(size)), upload.id, n1)
    assert.equal(n2, n1 + size)
    const {offset} = await store.getUpload(upload.id)
    assert.equal(getIncompletePart.called, true)
    assert.equal(deleteIncompletePart.called, false)
    assert.equal(uploadIncompletePart.called, false)
    assert.equal(uploadPart.calledTwice, true)
    assert.equal(offset, size + size)
  })

  it('should not read incomplete part on HEAD request', async function () {
    const store = this.datastore
    const size = 4096
    const incompleteSize = 1024

    const upload = new Upload({
      id: shared.testId('get-incomplete-part-size-test'),
      size: size + incompleteSize,
      offset: 0,
    })

    await store.create(upload)
    upload.offset = await store.write(
      Readable.from(Buffer.alloc(incompleteSize)),
      upload.id,
      upload.offset
    )

    const getIncompletePart = sinon.spy(store, 'getIncompletePart')
    const getIncompletePartSize = sinon.spy(store, 'getIncompletePartSize')

    const {offset} = await store.getUpload(upload.id)

    assert.equal(getIncompletePart.called, false)
    assert.equal(getIncompletePartSize.called, true)
    assert.equal(offset, incompleteSize)
  })

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  shared.shouldRemoveUploads() // Termination extension
  shared.shouldWriteUploads()
  shared.shouldHandleOffset()
  shared.shouldDeclareUploadLength() // Creation-defer-length extension
})
