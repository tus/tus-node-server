import path from 'node:path'
import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'

import sinon from 'sinon'

import {S3Store} from './'
import * as shared from '../../test/stores.test'
import {Upload} from '@tus/server'

const fixturesPath = path.resolve('../', '../', 'test', 'fixtures')
const storePath = path.resolve('../', '../', 'test', 'output')

describe('S3DataStore', function () {
  before(function () {
    this.testFileSize = 960_244
    this.testFileName = 'test.mp4'
    this.storePath = storePath
    this.testFilePath = path.resolve(fixturesPath, this.testFileName)
  })
  beforeEach(function () {
    this.datastore = new S3Store({
      partSize: 8 * 1024 * 1024, // Each uploaded part will have ~8MB,
      s3ClientConfig: {
        bucket: process.env.AWS_BUCKET as string,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
        region: process.env.AWS_REGION,
      },
    })
  })

  it('should correctly prepend a buffer to a file', async function () {
    const p = path.resolve(fixturesPath, 'foo.txt')
    await fs.writeFile(p, 'world!')
    await this.datastore.prependIncompletePart(p, Buffer.from('Hello, '))
    assert(await fs.readFile(p, 'utf8'), 'Hello, world!')
    await fs.unlink(p)
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
      id: 'incomplete-part-test',
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

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  // Termination extension not implemented yet
  // shared.shouldRemoveUploads()
  shared.shouldWriteUploads()
  shared.shouldHandleOffset()
  shared.shouldDeclareUploadLength() // Creation-defer-length extension
})
