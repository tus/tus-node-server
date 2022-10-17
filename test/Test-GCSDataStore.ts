import path from 'node:path'

import GCSDataStore from '../lib/stores/GCSDataStore'

import * as shared from './Test-Stores.shared'

describe('GCSDataStore', () => {
  before(function (this: any) {
    this.testFileSize = 960_244
    this.testFileName = 'test.mp4'
    this.storePath = '/test/output'
    this.testFilePath = path.resolve('test', 'fixtures', this.testFileName)
  })

  beforeEach(function (this: any) {
    this.datastore = new GCSDataStore({
      projectId: 'tus-node-server',
      keyFilename: path.resolve('test', '../keyfile.json'),
      bucket: 'tus-node-server-ci',
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
