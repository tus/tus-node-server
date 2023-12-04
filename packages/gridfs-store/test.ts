import path from 'node:path'

import {GridFsStore} from './'
import {MongoMemoryServer} from 'mongodb-memory-server'
import debug from 'debug'
import * as shared from '../../test/stores.test'
const fixturesPath = path.resolve('../', '../', 'test', 'fixtures')
const storePath = path.resolve('../', '../', 'test', 'output')

debug('*')
describe('GridFsStore', function () {
  before(async function () {
    this.testFileSize = 960_244
    this.testFileName = 'test.mp4'
    this.storePath = storePath
    this.testFilePath = path.resolve(fixturesPath, this.testFileName)
    this.mongod = await MongoMemoryServer.create()
    this.datastore = new GridFsStore({
      dbName: 'test',
      mongoUri: this.mongod.getUri(),
      bucketName: 'Test_uploads',
    })
  })

  beforeEach(async function () {
    // clear and reuse the same datastore before each test run
    await this.datastore.configstore.clear()
  })

  after(async function () {
    await this.datastore.clientConnection.close()
    await this.mongod.stop()
  })

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  shared.shouldRemoveUploads() // Termination extension
  shared.shouldExpireUploads() // Expiration extension
  shared.shouldWriteUploads()
  shared.shouldHandleOffset()
  shared.shouldDeclareUploadLength() // Creation-defer-length extension
})
