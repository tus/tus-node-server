import {Storage, Bucket, StorageOptions, BucketOptions} from '@google-cloud/storage'
import stream from 'node:stream'
import http from 'node:http'
import debug from 'debug'

import {ERRORS, TUS_RESUMABLE} from '@tus/server'
import {Upload, DataStore} from '@tus/server'

const log = debug('tus-node-server:stores:gcsstore')

type Options =
  | {bucket: string; storageOptions: StorageOptions; bucketOptions?: BucketOptions}
  | {bucket: Bucket}

function isBucketObject(options: Options): options is {bucket: Bucket} {
  return options.bucket instanceof Bucket
}

export class GCSStore extends DataStore {
  bucket: Bucket

  constructor(options: Options) {
    super()

    if (!options.bucket) {
      throw new Error('GCSDataStore must have a bucket')
    }

    if (isBucketObject(options)) {
      this.bucket = options.bucket
    } else {
      const storage = new Storage(options.storageOptions)
      this.bucket = storage.bucket(options.bucket, options.bucketOptions)
    }

    this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length']
  }

  create(file: Upload): Promise<Upload> {
    return new Promise((resolve, reject) => {
      if (!file.id) {
        reject(ERRORS.FILE_NOT_FOUND)
        return
      }

      const gcs_file = this.bucket.file(file.id)

      const options = {
        metadata: {
          metadata: {
            tus_version: TUS_RESUMABLE,
            size: file.size,
            sizeIsDeferred: `${file.sizeIsDeferred}`,
            offset: file.offset,
            metadata: JSON.stringify(file.metadata),
          },
        },
      }
      const fake_stream = new stream.PassThrough()
      fake_stream.end()
      fake_stream
        .pipe(gcs_file.createWriteStream(options))
        .on('error', reject)
        .on('finish', () => {
          resolve(file)
        })
    })
  }

  read(file_id: string) {
    return this.bucket.file(file_id).createReadStream()
  }

  /**
   * Get the file metatata from the object in GCS, then upload a new version
   * passing through the metadata to the new version.
   */
  write(
    readable: http.IncomingMessage | stream.Readable,
    id: string,
    offset: number
  ): Promise<number> {
    // GCS Doesn't persist metadata within versions,
    // get that metadata first
    return this.getUpload(id).then((upload) => {
      return new Promise((resolve, reject) => {
        const file = this.bucket.file(id)
        const destination = upload.offset === 0 ? file : this.bucket.file(`${id}_patch`)
        const options = {
          offset,
          metadata: {
            metadata: {
              tus_version: TUS_RESUMABLE,
              size: upload.size,
              sizeIsDeferred: `${upload.sizeIsDeferred}`,
              offset,
              metadata: upload.metadata,
            },
          },
        }
        const write_stream = destination.createWriteStream(options)
        if (!write_stream || readable.destroyed) {
          reject(ERRORS.FILE_WRITE_ERROR)
          return
        }

        let bytes_received = upload.offset
        readable.on('data', (buffer) => {
          bytes_received += buffer.length
        })
        stream.pipeline(readable, write_stream, async (e) => {
          if (e) {
            log(e)
            try {
              await destination.delete({ignoreNotFound: true})
            } finally {
              reject(ERRORS.FILE_WRITE_ERROR)
            }
          } else {
            log(`${bytes_received} bytes written`)
            try {
              if (file !== destination) {
                await this.bucket.combine([file, destination], file)
                await Promise.all([
                  file.setMetadata(options.metadata),
                  destination.delete({ignoreNotFound: true}),
                ])
              }

              resolve(bytes_received)
            } catch (error) {
              log(error)
              reject(ERRORS.FILE_WRITE_ERROR)
            }
          }
        })
      })
    })
  }

  getUpload(id: string): Promise<Upload> {
    return new Promise((resolve, reject) => {
      if (!id) {
        reject(ERRORS.FILE_NOT_FOUND)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.bucket.file(id).getMetadata((error: any, metadata: any) => {
        if (error && error.code === 404) {
          return reject(ERRORS.FILE_NOT_FOUND)
        }

        if (error) {
          log('[GCSDataStore] getFileMetadata', error)
          return reject(error)
        }

        const {size, metadata: meta} = metadata.metadata
        return resolve(
          new Upload({
            id,
            size: size ? Number.parseInt(size, 10) : size,
            offset: Number.parseInt(metadata.size, 10), // `size` is set by GCS
            metadata: meta ? JSON.parse(meta) : undefined,
          })
        )
      })
    })
  }

  async declareUploadLength(id: string, upload_length: number) {
    const upload = await this.getUpload(id)

    upload.size = upload_length

    await this.bucket.file(id).setMetadata({metadata: upload})
  }
}
