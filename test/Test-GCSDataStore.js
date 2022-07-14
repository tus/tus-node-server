'use strict'
const path = require('path')

const GCSDataStore = require('../lib/stores/GCSDataStore')

const shared = require('./Test-Stores.shared')

describe('GCSDataStore', () => {
  before(function () {
    this.testFileSize = 960244
    this.testFileName = 'test.mp4'
    this.storePath = '/test/output'
    this.testFilePath = path.resolve(__dirname, 'fixtures', this.testFileName)
  })

  beforeEach(function () {
    this.datastore = new GCSDataStore({
      path: this.storePath,
      projectId: 'tus-node-server',
      keyFilename: path.resolve(__dirname, '../keyfile.json'),
      bucket: 'tus-node-server-ci',
    })
  })

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  // Termination extension not implemented yet
  // shared.shouldRemoveUploads()
  shared.shouldWriteUploads()
  shared.shouldHandleOffset()
})
