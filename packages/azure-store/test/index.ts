import 'should'
import fs from 'node:fs'
import fsProm from 'node:fs/promises'
import path from 'node:path'
import {AzureStore} from '../src'
import * as shared from 'test/stores.test'

const fixturesPath = path.resolve('../', '../', 'test', 'fixtures')
const storePath = path.resolve('../', '../', 'test', 'output', 'azure-store')

async function cleanup() {
  if (fs.existsSync(storePath)) {
    await fsProm.rm(storePath, {recursive: true})
    await fsProm.mkdir(storePath)
  }
}

describe('AzureStore', function () {
  before(function () {
    this.testFileSize = 960_244
    this.testFileName = 'test.mp4'
    this.storePath = storePath
    this.testFilePath = path.resolve(fixturesPath, this.testFileName)
  })

  beforeEach(function () {
    this.datastore = new AzureStore({
      account: process.env.AZURE_ACCOUNT_ID as string,
      accountKey: process.env.AZURE_ACCOUNT_KEY as string,
      containerName: process.env.AZURE_CONTAINER_NAME as string,
    })
  })

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  // shared.shouldRemoveUploads() // Not implemented yet
  // shared.shouldExpireUploads() // Not implemented yet
  shared.shouldWriteUploads()
  shared.shouldHandleOffset()
  shared.shouldDeclareUploadLength() // Creation-defer-length extension
})
