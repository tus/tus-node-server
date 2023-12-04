import {DataStore, ERRORS, Upload} from '@tus/server'
import stream from 'node:stream'
import debug from 'debug'
import {callbackify} from 'node:util'
import {
  GridFsBucketUpdateStream,
  GridFsBucketExtended,
  countChunks,
} from './mongoutils/mongoExtension'
import {
  MongoClient,
  ObjectId,
  Db,
  GridFSBucketOptions,
  Collection,
  GridFSBucket,
  GridFSChunk,
  Binary,
} from 'mongodb'
const log = debug('tus-node-server:stores:gridfsstore')
import http from 'node:http'
import {MongodbConfigStore} from './mongoutils/Configstore'

type Options = {
  mongoUri: string
  bucketName: string // not upload
  dbName: string
  chunkSizeBtyes?: number /***  default ChunkSize is 255kB */
  expirationPeriodinMs?: number
}

class GridFsStore extends DataStore {
  configstore: MongodbConfigStore
  readonly bucket: GridFSBucket
  readonly bucketOptions: GridFSBucketOptions
  private bucketName: string
  readonly clientConnection: MongoClient
  readonly chunkCollection: Collection<GridFSChunk>
  private Db: Db
  private fileCollection: Collection
  expirationPeriodInMilliseconds: number

  lostBytes = 0
  constructor({
    dbName,
    mongoUri,
    chunkSizeBtyes,
    bucketName,
    expirationPeriodinMs,
  }: Options) {
    super()

    if (!dbName || !mongoUri || !bucketName) {
      throw new Error(
        'GridfsStore missing  mongoUri or databaseName(dbName) or bucketName'
      )
    }

    this.clientConnection = new MongoClient(mongoUri)
    callbackify(this.clientConnection.connect)(() => {})

    this.Db = this.clientConnection.db(dbName, {
      ignoreUndefined: true,
    })
    this.bucketName = bucketName
    this.expirationPeriodInMilliseconds = expirationPeriodinMs ?? 0

    this.bucketOptions = {bucketName}

    if (chunkSizeBtyes) {
      this.bucketOptions.chunkSizeBytes = chunkSizeBtyes
    }

    this.bucket = new GridFSBucket(this.Db, this.bucketOptions)
    this.configstore = new MongodbConfigStore(this.Db)
    this.fileCollection = this.Db.collection(this.bucketName + '.files')
    this.chunkCollection = this.Db.collection(this.bucketName + '.chunks')
    this.addRequireIndexes()

    this.extensions = [
      'creation',
      'creation-with-upload',
      'creation-defer-length',
      'termination',
      'expiration',
    ]
  }

  create(file: Upload): Promise<Upload> {
    return this.exists(file.id).then((fileExists) => {
      return new Promise(async (resolve, reject) => {
        if (!fileExists) {
          const gridfs_stream = this.bucket.openUploadStream(file.id)

          const fake_stream = new stream.PassThrough()
          fake_stream.end()
          fake_stream
            .pipe(gridfs_stream)
            .on('error', reject)
            .on('finish', () => {
              this.configstore.set(file.id, file)
              return resolve(file)
            })
        } else {
          this.configstore.set(file.id, file)
          return resolve(file)
        }
      })
    })
  }

  findOne(file_name: string) {
    return this.fileCollection.findOne({filename: file_name})
  }

  read(file_id: string) {
    return this.bucket.openDownloadStreamByName(file_id)
  }
  async exists(id: string): Promise<boolean> {
    return this.configstore.exists(id)
  }

  remove(id: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const found = await this.findOne(id)
        if (!found) {
          throw ERRORS.FILE_NOT_FOUND
        }
        await this.bucket.delete(found._id)

        return resolve(this.configstore.delete(id))
      } catch (err) {
        log('[GridFsStore] delete: Error', err)
        reject(err)
      }
    })
  }

  write(
    readable: http.IncomingMessage | stream.Readable,
    id: string,
    offset: number
  ): Promise<number> {
    // check if stream exist

    return this.configstore.getStats(id).then((upload) => {
      return new Promise(async (resolve, reject) => {
        if (!upload) {
          return reject(ERRORS.FILE_NOT_FOUND)
        }
        const gridfsId = await this.findOne(id)
        const extendedBucket = new GridFsBucketExtended(this.Db, this.bucketOptions)
        let chunkCount = 0

        const bytes_received = upload?.current_size || offset
        if (gridfsId) {
          chunkCount = await countChunks(this.chunkCollection, gridfsId._id)
        }

        const file = new GridFsBucketUpdateStream(extendedBucket, id, {
          id: gridfsId?._id,
          chunkCount,
          offset: offset,
          paused: upload?.paused,
          fileSizeHint: upload?.size,
        })

        const destination = file

        const write_stream = destination
        if (offset > 0) {
          log(
            `[GridFsStore] file resumed with ${chunkCount} chunks store, offset = ${offset} bytes, currentSize in database:${upload?.current_size} bytes`
          )
          await this.configstore.setPaused(id, false)
        }
        if (!write_stream || readable.destroyed) {
          return reject(ERRORS.FILE_NO_LONGER_EXISTS)
        }

        readable.on('data', async () => {
          if (write_stream instanceof GridFsBucketUpdateStream) {
          }
        })
        readable.on('close', async () => {
          if (
            readable.readableAborted &&
            upload?.size &&
            bytes_received < upload.size &&
            write_stream instanceof GridFsBucketUpdateStream
          ) {
            write_stream.pause(async () => {
              await this.configstore.setCurrentSize(id, write_stream.bytesWritten)
            })
            await this.configstore.setPaused(id, true)
          }
        })

        readable.on('error', (err) => {
          console.log(err.message)
          log('[GridFsStore] write: Error', err)
          return reject(ERRORS.FILE_WRITE_ERROR)
        })
        readable.pipe(write_stream)

        write_stream.on('finish', async () => {
          log(`[GridFsStore] write: ${write_stream.bytesRecieved} bytes written to ${id}`)
          offset = write_stream.bytesWritten
          log(`[GridFsStore] write: File is now ${offset} bytes`)
          log(`[GridFsStore], missing ${Number(upload?.size) - offset} bytes`)

          await this.configstore.setCurrentSize(id, write_stream.bytesWritten)

          return resolve(offset)
        })
      })
    })
  }

  updateMetadata(id: ObjectId, update: Record<string, unknown>) {
    return this.Db.collection(this.bucketName + '.files').findOneAndUpdate(
      {_id: id},
      {
        $set: {metadata: update},
      },
      {returnDocument: 'after'}
    )
  }

  getUpload(id: string): Promise<Upload> {
    return this.configstore.getStats(id).then((file) => {
      return new Promise((resolve, reject) => {
        if (!file) {
          return reject(ERRORS.FILE_NOT_FOUND)
        }

        const upload = new Upload({
          id,
          size: file.size,
          offset: file.current_size,
          metadata: file.metadata,
          creation_date: file.creation_date,
        })
        return resolve(upload)
      })
    })
  }
  addRequireIndexes() {
    const db = this.Db

    db.collection((this.bucketName as string) + '.chunks').createIndex(
      {files_id: 1, n: 1},
      {unique: true}
    )

    this.fileCollection.createIndex({
      uploadDate: 1,
    })
  }

  declareUploadLength(id: string, upload_length: number): Promise<void> {
    return this.configstore.get(id).then((file) => {
      return new Promise((resolve, reject) => {
        if (!file) {
          return reject(ERRORS.FILE_NOT_FOUND)
        }
        file.size = upload_length

        resolve(this.configstore.set(id, file))
      })
    })
  }

  async deleteExpired(): Promise<number> {
    const now = new Date()
    const toDelete: Promise<void>[] = []

    if (!this.configstore.list) {
      throw ERRORS.UNSUPPORTED_EXPIRATION_EXTENSION
    }

    const uploadKeys = await this.configstore.list()

    for (const file_id of uploadKeys) {
      try {
        const info = await this.configstore.get(file_id)

        if (
          info &&
          'creation_date' in info &&
          this.getExpiration() > 0 &&
          info.size !== info.offset &&
          info.creation_date
        ) {
          const creation = new Date(info.creation_date)
          const expires = new Date(creation.getTime() + this.getExpiration())
          if (now > expires) {
            toDelete.push(this.remove(file_id))
          }
        }
      } catch (error) {
        if (error !== ERRORS.FILE_NO_LONGER_EXISTS) {
          throw error
        }
      }
    }

    await Promise.all(toDelete)
    return toDelete.length
  }
  async getSize(id: ObjectId) {
    const chunks = await this.chunkCollection.find({files_id: id}, {}).toArray()
    if (!chunks.length) {
      return 0
    }
    let totalSize = 0
    const files = chunks.filter((v) => v)
    for (const chunk of files) {
      const data = chunk.data as unknown as Binary
      totalSize += data.length()
    }

    return totalSize
  }

  getExpiration(): number {
    return this.expirationPeriodInMilliseconds
  }
}

export {GridFsStore, MongodbConfigStore}
