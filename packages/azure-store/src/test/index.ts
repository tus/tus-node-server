import 'should'
import {strict as assert} from 'node:assert'
import path from 'node:path'
import {ContainerClient} from '@azure/storage-blob'
import {AzureStore} from '@tus/azure-store'
import * as shared from '../../../utils/dist/test/stores.js'

const fixturesPath = path.resolve('../', '../', 'test', 'fixtures')
const storePath = path.resolve('../', '../', 'test', 'output', 'azure-store')

describe('AzureStore', () => {
  before(function () {
    this.testFileSize = 960_244
    this.testFileName = 'test.mp4'
    this.storePath = storePath
    this.testFilePath = path.resolve(fixturesPath, this.testFileName)
  })

  beforeEach(function () {
    const hasCredentials =
      process.env.AZURE_ACCOUNT_ID &&
      process.env.AZURE_ACCOUNT_KEY &&
      process.env.AZURE_CONTAINER_NAME

    if (hasCredentials) {
      this.datastore = new AzureStore({
        account: process.env.AZURE_ACCOUNT_ID as string,
        accountKey: process.env.AZURE_ACCOUNT_KEY as string,
        containerName: process.env.AZURE_CONTAINER_NAME as string,
      })
    } else {
      this.datastore = new AzureStore({
        containerClient: new ContainerClient(
          'https://testaccount.blob.core.windows.net/testcontainer'
        ),
      })
    }
  })

  shared.shouldHaveStoreMethods()
  if (
    process.env.AZURE_ACCOUNT_ID &&
    process.env.AZURE_ACCOUNT_KEY &&
    process.env.AZURE_CONTAINER_NAME
  ) {
    shared.shouldCreateUploads()
    shared.shouldWriteUploads()
    shared.shouldHandleOffset()
    shared.shouldDeclareUploadLength()
  }

  it('should accept a ContainerClient', () => {
    const containerClient = new ContainerClient(
      'https://testaccount.blob.core.windows.net/testcontainer'
    )
    const store = new AzureStore({containerClient})

    assert.ok(store)
  })

  it('should throw when account is missing', () => {
    assert.throws(
      () =>
        new AzureStore({
          account: '',
          containerName: 'test',
          accountKey: 'key',
        }),
      /account/
    )
  })

  it('should throw when accountKey is missing', () => {
    assert.throws(
      () =>
        new AzureStore({
          account: 'test',
          containerName: 'test',
          accountKey: '',
        }),
      /account key/
    )
  })

  it('should throw when containerName is missing', () => {
    assert.throws(
      () =>
        new AzureStore({
          account: 'test',
          containerName: '',
          accountKey: 'key',
        }),
      /container name/
    )
  })
})
