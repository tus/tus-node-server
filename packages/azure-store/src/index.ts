import type stream from 'node:stream'
import debug from 'debug'
import {
  DataStore,
  Upload,
  ERRORS,
  type KvStore,
  MemoryKvStore,
  TUS_RESUMABLE,
  Metadata,
} from '@tus/utils'
import {
  type AppendBlobClient,
  type BlobGetPropertiesResponse,
  BlobServiceClient,
  type ContainerClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'

type Options = {
  cache?: KvStore<Upload>
  account: string
  accountKey: string
  containerName: string
}

const log = debug('tus-node-server:stores:azurestore')

/**
 * Store using the Azure Storage SDK
 * @author Bharath Battaje <bharathraob@gmail.com>
 */
export class AzureStore extends DataStore {
  private cache: KvStore<Upload>
  private blobServiceClient: BlobServiceClient
  private containerClient: ContainerClient
  private containerName: string

  constructor(options: Options) {
    super()
    this.cache = options.cache ?? new MemoryKvStore<Upload>()
    this.extensions = ['creation', 'creation-defer-length']

    if (!options.account) {
      throw new Error('Azure store must have a account')
    }
    if (!options.accountKey) {
      throw new Error('Azure store must have a account key')
    }
    if (!options.containerName) {
      throw new Error('Azure store must have a container name')
    }

    const storageAccountBaseUrl = `https://${options.account}.blob.core.windows.net`
    const sharedKeyCredential = new StorageSharedKeyCredential(
      options.account,
      options.accountKey
    )

    this.blobServiceClient = new BlobServiceClient(
      storageAccountBaseUrl,
      sharedKeyCredential
    )
    this.containerClient = this.blobServiceClient.getContainerClient(
      options.containerName
    )
    this.containerName = options.containerName
  }

  /**
   * Saves upload metadata to blob metada. Also upload metadata
   * gets saved in local cache as well to avoid calling azure server everytime.
   */
  private async saveMetadata(appendBlobClient: AppendBlobClient, upload: Upload) {
    log(`[${upload.id}] saving metadata`)

    await this.cache.set(appendBlobClient.url, upload)

    await appendBlobClient.setMetadata(
      {
        tus_version: TUS_RESUMABLE,
        upload: JSON.stringify({
          ...upload,
          // Base64 encode the metadata to avoid errors for non-ASCII characters
          metadata: Metadata.stringify(upload.metadata ?? {}),
        }),
      },
      {}
    )

    log(`[${upload.id}] metadata saved`)
  }

  /**
   * Retrieves upload metadata previously saved.
   * It tries to get from local cache, else get from the blob metadata.
   */
  private async getMetadata(appendBlobClient: AppendBlobClient): Promise<Upload> {
    const cached = await this.cache.get(appendBlobClient.url)

    if (cached) {
      log(`[${cached.id}] metadata returned from cache`)
      return cached
    }

    let propertyData: BlobGetPropertiesResponse
    try {
      propertyData = await appendBlobClient.getProperties()
    } catch (error) {
      log('Error while fetching the metadata.', error)
      throw ERRORS.UNKNOWN_ERROR
    }

    if (!propertyData.metadata) {
      throw ERRORS.FILE_NOT_FOUND
    }
    const upload = JSON.parse(propertyData.metadata.upload) as Upload
    // Metadata is base64 encoded to avoid errors for non-ASCII characters
    // so we need to decode it separately
    upload.metadata = Metadata.parse(JSON.stringify(upload.metadata ?? {}))

    await this.cache.set(appendBlobClient.url, upload)

    log('metadata returned from blob get properties')

    return upload
  }

  /**
   * provides the readable stream for the previously uploaded file
   */
  public async read(file_id: string) {
    const appendBlobClient = this.containerClient.getAppendBlobClient(file_id)
    const downloadResponse = await appendBlobClient.download()

    return downloadResponse.readableStreamBody
  }

  /**
   * Creates a empty append blob on Azure storage and attaches the metadata to it.
   */
  public async create(upload: Upload) {
    log(`[${upload.id}] initializing azure storage file upload`)

    try {
      const appendBlobClient = this.containerClient.getAppendBlobClient(upload.id)
      await appendBlobClient.createIfNotExists()

      upload.storage = {
        type: 'AzureBlobStore',
        path: upload.id,
        bucket: this.containerName,
      }

      await this.saveMetadata(appendBlobClient, upload)

      return upload
    } catch (err) {
      throw ERRORS.UNKNOWN_ERROR
    }
  }

  /**
   * Gets the current file upload status
   */
  public async getUpload(id: string): Promise<Upload> {
    const appendBlobClient = this.containerClient.getAppendBlobClient(id)
    const upload = await this.getMetadata(appendBlobClient)

    if (!upload) {
      throw ERRORS.FILE_NOT_FOUND
    }

    return new Upload({
      id: id,
      size: upload.size,
      metadata: upload.metadata,
      offset: upload.offset,
      storage: upload.storage,
      creation_date: upload.creation_date,
    })
  }

  /**
   * Uploads each blob to the azure blob storage. Please note that current official Azure stoarge node sdk has some limitation
   * when it comes to stream upload. So here we are concatenating all the chunks from a request into a block and then uploading
   * to azure storage using the appendBlock. This can be upgraded to streamUpload when node sdk start supporting it.
   */
  public async write(
    stream: stream.Readable,
    id: string,
    offset: number
  ): Promise<number> {
    log(`started writing the file offset [${offset}]`)

    const appendBlobClient = this.containerClient.getAppendBlobClient(id)
    const upload = await this.getMetadata(appendBlobClient)

    // biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
    return new Promise(async (resolve, reject) => {
      if (offset < upload.offset) {
        //duplicate request scenario, dont want to write the same data
        return resolve(upload.offset)
      }

      try {
        const bufs: Buffer[] = []

        stream.on('data', async (chunk: Buffer) => {
          if (stream.destroyed) {
            return reject(ERRORS.ABORTED)
          }

          bufs.push(chunk)
        })

        stream.on('end', async () => {
          const buf = Buffer.concat(bufs)

          if (buf.length > 0) {
            await appendBlobClient.appendBlock(buf, buf.length)
          }

          upload.offset = upload.offset + buf.length
          log(`saved offset is [${upload.offset}]`)

          await this.saveMetadata(appendBlobClient, upload)

          if (upload.offset === upload.size) {
            await this.cache.delete(appendBlobClient.url)
            log(`file upload completed successfully [${id}]`)
          }

          return resolve(upload.offset)
        })

        stream.on('error', async () => {
          return reject(ERRORS.UNKNOWN_ERROR)
        })
      } catch (err) {
        return reject('something went wrong while writing the file.')
      }
    })
  }

  public async declareUploadLength(id: string, upload_length: number) {
    const appendBlobClient = this.containerClient.getAppendBlobClient(id)
    const upload = await this.getMetadata(appendBlobClient)

    if (!upload) {
      throw ERRORS.FILE_NOT_FOUND
    }

    upload.size = upload_length

    await this.saveMetadata(appendBlobClient, upload)
  }
}
