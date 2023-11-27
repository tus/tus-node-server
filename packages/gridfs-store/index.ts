import {DataStore, ERRORS, TUS_RESUMABLE, Upload} from '@tus/server'
import stream from 'node:stream'
import debug from 'debug'
import {
  GridFSBucket,
  MongoClient,
  ObjectId,
  Db,
  GridFSFile,
  GridFSBucketOptions,
} from 'mongodb'
const log = debug('tus-node-server:stores:gridfsstore')
import http from 'node:http'

type Options = {
  mongoUri: string
  bucketName: string // not upload
  dbName: string
  chunkSizeBtyes?: number /***  default ChunkSize is 255kB */
  expirationPeriodinMs?: number
}

type StoredPayload = {
  metadata?: {
    tus_version: string
    size: string
    sizeIsDeferred: string
    offset: string
    metadata: string
  }
}
export class GridFsStore extends DataStore {
  readonly bucket: GridFSBucket
  private bucketName: string
  private client: MongoClient
  private filesInProcess: Map<string, ObjectId> = new Map() // map the files to mongodb IDs;
  private Db: Db
  private expirationPeriod: number
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

    this.client = new MongoClient(mongoUri)
    this.Db = this.client.db(dbName)
    this.bucketName = bucketName
    this.expirationPeriod = expirationPeriodinMs ?? 0

    const bucketOptions: GridFSBucketOptions = {bucketName}

    if (chunkSizeBtyes) {
      bucketOptions.chunkSizeBytes = chunkSizeBtyes
    }

    this.bucket = new GridFSBucket(this.Db, bucketOptions)
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
    return new Promise((resolve, reject) => {
      if (!file.id) {
        reject(ERRORS.FILE_NOT_FOUND)
        return
      }

      const options = {
        metadata: {
          metadata: {
            tus_version: TUS_RESUMABLE,
            size: file.size,
            sizeIsDeferred: file.sizeIsDeferred,
            offset: file.offset,
            metadata: JSON.stringify(file.metadata),
          },
        },
      }

      const gridfs_stream = this.bucket.openUploadStream(file.id, options)

      const fake_stream = new stream.PassThrough()
      fake_stream.end()
      fake_stream
        .pipe(gridfs_stream)
        .on('error', reject)
        .on('finish', () => {
          this.filesInProcess.set(file.id, gridfs_stream.id)
          resolve(file)
        })
    })
  }

  read(file_id: string) {
    return this.bucket.openDownloadStreamByName(file_id)
  }

  remove(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const gridFsFileId = this.filesInProcess.get(id)
      if (!gridFsFileId) {
        log('[GridFsStore] delete:err', ERRORS.FILE_NOT_FOUND)
        reject(ERRORS.FILE_NOT_FOUND)
        return
      }

      this.bucket
        .delete(gridFsFileId)
        .then(() => {
          this.filesInProcess.delete(id)
          resolve()
        })
        .catch(reject)
    })
  }

  write(
    readable: http.IncomingMessage | stream.Readable,
    file_id: string,
    offset: number
  ): Promise<number> {
    const writeable = this.bucket.openUploadStream(file_id, {})

    let bytes_received = 0
    const transform = new stream.Transform({
      transform(chunk, _, callback) {
        bytes_received += chunk.length
        callback(null, chunk)
      },
    })

    return new Promise((resolve, reject) => {
      stream.pipeline(readable, transform, writeable, (err) => {
        if (err) {
          log('[GridFsStore] write: Error', err)
          return reject(ERRORS.FILE_WRITE_ERROR)
        }

        log(
          `[GridFsStore] write: ${bytes_received} bytes written to gridsFiles with id${writeable.id}`
        )
        offset += bytes_received
        log(`[GridFsStore] write: File is now ${offset} bytes`)

        return resolve(offset)
      })
    })
  }

  getUpload(id: string): Promise<Upload> {
    const gridfsId = this.filesInProcess.get(id)

    if (!gridfsId) {
      throw ERRORS.FILE_NOT_FOUND
    }
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.bucket
        .find({_id: gridfsId})
        .toArray()
        .then((docs) => {
          const file = docs[0]
          if (!file) {
            reject(ERRORS.FILE_NOT_FOUND)
          }

          const {metadata: meta} = file.metadata as unknown as StoredPayload

          const upload = new Upload({
            id,
            size: meta?.size ? parseInt(meta.size) : undefined,
            offset: file.length,
            metadata: meta?.metadata ? JSON.parse(meta.metadata) : undefined,
            creation_date: file.uploadDate.toString(),
          })

          resolve(upload)
        })
        .catch((err: unknown) => {
          log('[GridFsStore] findFile error', err)
          reject(err)
        })
    })
  }
  addRequireIndexes() {
    const db = this.Db

    db.collection((this.bucketName as string) + '.chunks').createIndex(
      {files_id: 1, n: 1},
      {unique: true}
    )

    db.collection((this.bucketName as string) + '.files').createIndex({
      uploadDate: 1,
    })
  }

  async declareUploadLength(id: string, upload_length: number): Promise<void> {
    const gridfsId = await this.filesInProcess.get(id)
    if (!gridfsId) {
      throw ERRORS.FILE_NOT_FOUND
    }

    return this.Db.collection<GridFSFile>(this.bucketName + '.files')
      .findOneAndUpdate({_id: gridfsId}, {'metadata.metadata.size': upload_length})
      .then(() => {}) // do nothing

      .catch((e) => log('[GridFsStore] error', e))
  }

  async deleteExpired(): Promise<number> {
    const now = new Date()
    const toDelete: Promise<void>[] = []
    try {
      const files = await this.bucket.find({}).toArray()
      for (const file of files) {
        if (
          this.filesInProcess.has(file.filename) &&
          file?.metadata?.creation_date &&
          this.getExpiration() > 0 &&
          file?.metadata.size !== file.metadata?.offset
        ) {
          const creation = new Date(file?.metadata.creation_date)
          const expires = new Date(creation.getTime() + this.getExpiration())

          if (now > expires) {
            toDelete.push(this.remove(file.filename))
          }
        }
      }
    } catch (error) {
      if (error !== ERRORS.FILE_NO_LONGER_EXISTS) {
        throw error
      }
    }
    await Promise.all(toDelete)
    return toDelete.length
  }

  getExpiration(): number {
    return this.expirationPeriod
  }
}
