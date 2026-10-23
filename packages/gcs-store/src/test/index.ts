import {strict as assert} from 'node:assert'
import path from 'node:path'
import {Readable} from 'node:stream'

import {GCSStore} from '@tus/gcs-store'
import {TUS_RESUMABLE, Upload} from '@tus/utils'

import * as shared from '../../../utils/dist/test/stores.js'

import {Storage} from '@google-cloud/storage'

const fixturesPath = path.resolve('../', '../', 'test', 'fixtures')
const storePath = path.resolve('../', '../', 'test', 'output', 'gcs-store')

describe('GCSStore', () => {
  before(function () {
    this.testFileSize = 960_244
    this.testFileName = 'test.mp4'
    this.storePath = storePath
    this.testFilePath = path.resolve(fixturesPath, this.testFileName)
  })

  beforeEach(function () {
    const storage = new Storage({
      projectId: 'tus-node-server',
      keyFilename: path.resolve('../', '../', 'keyfile.json'),
    })

    this.datastore = new GCSStore({
      bucket: storage.bucket('tus-node-server-ci'),
    })
  })

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  // Termination extension not implemented yet
  // shared.shouldRemoveUploads()
  shared.shouldWriteUploads()
  it('should preserve content type and tus metadata after an empty write', async function () {
    const datastore: GCSStore = this.datastore
    const upload = new Upload({
      id: `${shared.testId('empty-write-content-type')}.txt`,
      size: 0,
      offset: 0,
      metadata: {
        contentType: 'application/x-tus-test',
        filename: '世界.txt',
        is_confidential: null,
      },
    })
    const file = datastore.bucket.file(upload.id)

    try {
      await datastore.create(upload)
      const [createdMetadata] = await file.getMetadata()
      assert.equal(createdMetadata.contentType, 'application/x-tus-test')

      assert.equal(await datastore.write(Readable.from([]), upload.id, 0), 0)

      const storedUpload = await datastore.getUpload(upload.id)
      assert.equal(storedUpload.size, 0)
      assert.equal(storedUpload.offset, 0)
      assert.deepEqual(storedUpload.metadata, upload.metadata)

      const [contents] = await file.download()
      assert.equal(contents.length, 0)
      const [writtenMetadata] = await file.getMetadata()
      assert.equal(Number(writtenMetadata.size), 0)
      assert.equal(writtenMetadata.metadata?.tus_version, TUS_RESUMABLE)
      assert.equal(writtenMetadata.contentType, 'application/x-tus-test')
    } finally {
      await file.delete({ignoreNotFound: true})
    }
  })
  shared.shouldHandleOffset()
  shared.shouldDeclareUploadLength() // Creation-defer-length extension
})
