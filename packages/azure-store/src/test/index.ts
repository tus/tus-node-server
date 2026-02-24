import 'should'
import {strict as assert} from 'node:assert'
import path from 'node:path'
import {AzureStore} from '@tus/azure-store'
import type {TokenCredential} from '@azure/core-auth'
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
      const mockCredential: TokenCredential = {
        getToken: async () => ({
          token: 'mock-token',
          expiresOnTimestamp: Date.now() + 3600_000,
        }),
      }
      this.datastore = new AzureStore({
        account: 'testaccount',
        containerName: 'testcontainer',
        credential: mockCredential,
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

  describe('constructor', () => {
    it('should accept a TokenCredential instead of accountKey', () => {
      const mockCredential: TokenCredential = {
        getToken: async () => ({
          token: 'mock-token',
          expiresOnTimestamp: Date.now() + 3600_000,
        }),
      }
      const store = new AzureStore({
        account: 'testaccount',
        containerName: 'testcontainer',
        credential: mockCredential,
      })
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
})
