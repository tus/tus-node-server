import path from 'node:path'

import {GCSStore} from '../src'

import * as shared from 'test/stores.test'

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
  shared.shouldHandleOffset()
  shared.shouldDeclareUploadLength() // Creation-defer-length extension
})
