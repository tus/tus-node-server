import path from 'node:path'

import S3Store from '../lib/stores/S3Store'
import * as shared from './Test-Stores.shared'

describe('S3DataStore', () => {
  before(function () {
    this.testFileSize = 960_244
    this.testFileName = 'test.mp4'
    this.storePath = '/test/output'
    this.testFilePath = path.resolve(__dirname, 'fixtures', this.testFileName)
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
  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  // Termination extension not implemented yet
  // shared.shouldRemoveUploads()
  shared.shouldWriteUploads()
  shared.shouldHandleOffset()
  shared.shouldDeclareUploadLength() // Creation-defer-length extension
})
