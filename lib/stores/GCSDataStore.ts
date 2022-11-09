import {Storage, Bucket} from '@google-cloud/storage'
import stream from 'node:stream'
import http from 'node:http'
import debug from 'debug'

import {ERRORS, TUS_RESUMABLE} from '../constants'
import DataStore from './DataStore'
import Upload from '../models/Upload'

type Options = {
  bucket: string
  projectId: string
  keyFilename: string
}

const log = debug('tus-node-server:stores:gcsstore')

export default class GCSDataStore extends DataStore {
  bucket: Bucket
  bucket_name: string
  gcs: Storage

  constructor(options: Options) {
    super()

    if (!options.bucket) {
      throw new Error('GCSDataStore must have a bucket')
    }

    this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length']
    this.bucket_name = options.bucket
    this.gcs = new Storage({
      projectId: options.projectId,
      keyFilename: options.keyFilename,
    })
    // TODO: this can't be called async in constructor
    this.bucket = this._getBucket()
  }

  _getBucket() {
    const bucket = this.gcs.bucket(this.bucket_name)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bucket.exists((error: any, exists: boolean) => {
      // ignore insufficient access error, assume bucket exists
      if (error && error.code === 403) {
        return
      }

      if (error) {
        log(error)
        throw new Error(`[GCSDataStore] _getBucket: ${error.message}`)
      }

      if (!exists) {
        throw new Error(
          `[GCSDataStore] _getBucket: ${this.bucket_name} bucket does not exist`
        )
      }
    })
    return bucket
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
            metadata: file.metadata,
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
            metadata: meta,
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
