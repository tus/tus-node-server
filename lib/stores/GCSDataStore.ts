import {Storage, Bucket} from '@google-cloud/storage'
import stream from 'node:stream'
import http from 'node:http'
import debug from 'debug'

import {ERRORS, TUS_RESUMABLE} from '../constants'
import DataStore from './DataStore'

import type {File} from '../../types'

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

  create(file: File): Promise<File> {
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
            upload_length: file.upload_length,
            upload_metadata: file.upload_metadata,
            upload_defer_length: file.upload_defer_length,
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
    file_id: string,
    offset: number
  ): Promise<number> {
    // GCS Doesn't persist metadata within versions,
    // get that metadata first
    return this.getOffset(file_id).then((data) => {
      return new Promise((resolve, reject) => {
        const file = this.bucket.file(file_id)
        const destination = data.size === 0 ? file : this.bucket.file(`${file_id}_patch`)
        const options = {
          offset,
          metadata: {
            metadata: {
              upload_length: data.upload_length,
              tus_version: TUS_RESUMABLE,
              upload_metadata: data.upload_metadata,
              upload_defer_length: data.upload_defer_length,
            },
          },
        }
        const write_stream = destination.createWriteStream(options)
        if (!write_stream || readable.destroyed) {
          reject(ERRORS.FILE_WRITE_ERROR)
          return
        }

        let bytes_received = data.size as number
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

  getOffset(file_id: string): Promise<File> {
    return new Promise((resolve, reject) => {
      if (!file_id) {
        reject(ERRORS.FILE_NOT_FOUND)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.bucket.file(file_id).getMetadata((error: any, metadata: any) => {
        if (error && error.code === 404) {
          return reject(ERRORS.FILE_NOT_FOUND)
        }

        if (error) {
          log('[GCSDataStore] getFileMetadata', error)
          return reject(error)
        }

        const data: File = {
          id: file_id,
          size: Number.parseInt(metadata.size, 10),
        }
        if (!('metadata' in metadata)) {
          return resolve(data)
        }

        if (metadata.metadata.upload_length) {
          data.upload_length = metadata.metadata.upload_length
        }

        if (metadata.metadata.upload_defer_length) {
          data.upload_defer_length = metadata.metadata.upload_defer_length
        }

        if (metadata.metadata.upload_metadata) {
          data.upload_metadata = metadata.metadata.upload_metadata
        }

        return resolve(data)
      })
    })
  }

  async declareUploadLength(file_id: string, upload_length: string) {
    const metadata = await this.getOffset(file_id)
    metadata.upload_length = upload_length
    // NOTE: this needs to be `null` and not `undefined`,
    // GCS has logic that if it's the latter, it will keep the previous value ¯\_(ツ)_/¯
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    metadata.upload_defer_length = null!
    await this.bucket.file(file_id).setMetadata({metadata})
  }
}
