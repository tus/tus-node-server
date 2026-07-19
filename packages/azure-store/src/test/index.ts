import 'should'
import {strict as assert} from 'node:assert'
import path from 'node:path'
import {type AppendBlobClient, ContainerClient} from '@azure/storage-blob'
import {AzureStore} from '@tus/azure-store'
import {Metadata, type Upload} from '@tus/utils'
import * as shared from '../../../utils/dist/test/stores.js'

const fixturesPath = path.resolve('../', '../', 'test', 'fixtures')
const storePath = path.resolve('../', '../', 'test', 'output', 'azure-store')

type PersistedUpload = Pick<Upload, 'id' | 'size' | 'offset'> & {
  metadata: string | Upload['metadata']
}

function storeWithPersistedUpload(upload: PersistedUpload) {
  const appendBlobClient = {
    url: 'https://example.com/container/persisted-upload',
    getProperties: async () => ({metadata: {upload: JSON.stringify(upload)}}),
  } as unknown as AppendBlobClient
  const client = {
    containerName: 'container',
    getAppendBlobClient: () => appendBlobClient,
  } as unknown as ContainerClient

  return new AzureStore({client})
}

describe('AzureStore', () => {
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

  it('should accept a client', () => {
    const client = new ContainerClient(
      'https://testaccount.blob.core.windows.net/testcontainer'
    )
    const store = new AzureStore({client})

    assert.ok(store)
  })
})

describe('AzureStore persisted metadata', () => {
  it('decodes TUS metadata loaded from Azure', async () => {
    const metadata = {filename: '世界.pdf', is_confidential: null}
    const store = storeWithPersistedUpload({
      id: 'persisted-upload',
      size: 42,
      offset: 7,
      metadata: Metadata.stringify(metadata),
    })

    const upload = await store.getUpload('persisted-upload')

    assert.deepStrictEqual(upload.metadata, metadata)
  })

  it('restores empty persisted metadata', async () => {
    const store = storeWithPersistedUpload({
      id: 'persisted-upload',
      size: 42,
      offset: 7,
      metadata: '',
    })

    const upload = await store.getUpload('persisted-upload')

    assert.deepStrictEqual(upload.metadata, {})
  })

  it('preserves metadata stored before TUS encoding', async () => {
    const metadata = {filename: 'legacy.pdf'}
    const store = storeWithPersistedUpload({
      id: 'persisted-upload',
      size: 42,
      offset: 7,
      metadata,
    })

    const upload = await store.getUpload('persisted-upload')

    assert.deepStrictEqual(upload.metadata, metadata)
  })
})
