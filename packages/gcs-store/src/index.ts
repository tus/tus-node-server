import type {Bucket, CreateWriteStreamOptions} from '@google-cloud/storage'
import stream from 'node:stream'
import type http from 'node:http'
import debug from 'debug'

import {ERRORS, TUS_RESUMABLE, Upload, DataStore} from '@tus/utils'

const log = debug('tus-node-server:stores:gcsstore')

type Options = {bucket: Bucket}

export class GCSStore extends DataStore {
  bucket: Bucket

  constructor(options: Options) {
    super()

    if (!options.bucket) {
      throw new Error('GCSDataStore must have a bucket')
    }

    this.bucket = options.bucket

    this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length']
  }

  create(file: Upload): Promise<Upload> {
    return new Promise((resolve, reject) => {
      if (!file.id) {
        reject(ERRORS.FILE_NOT_FOUND)
        return
      }

      const gcs_file = this.bucket.file(file.id)

      file.storage = {type: 'gcs', path: file.id, bucket: this.bucket.name}

      const options: CreateWriteStreamOptions = {
        metadata: {
          metadata: {
            tus_version: TUS_RESUMABLE,
            ...this.#stringifyUploadKeys(file),
          },
        },
      }
      if (file.metadata?.contentType) {
        options.contentType = file.metadata.contentType
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

        upload.offset = offset

        const options = {
          metadata: {
            metadata: {
              tus_version: TUS_RESUMABLE,
              ...this.#stringifyUploadKeys(upload),
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

      // biome-ignore lint/suspicious/noExplicitAny: todo
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
            size: size ? Number.parseInt(size, 10) : undefined,
            offset: Number.parseInt(metadata.size, 10), // `size` is set by GCS
            metadata: meta ? JSON.parse(meta) : undefined,
            storage: {type: 'gcs', path: id, bucket: this.bucket.name},
          })
        )
      })
    })
  }

  async declareUploadLength(id: string, upload_length: number) {
    const upload = await this.getUpload(id)

    upload.size = upload_length

    await this.bucket.file(id).setMetadata({metadata: this.#stringifyUploadKeys(upload)})
  }
  /**
   * Convert the Upload object to a format that can be stored in GCS metadata.
   */
  #stringifyUploadKeys(upload: Upload) {
    return {
      size: upload.size ?? null,
      sizeIsDeferred: `${upload.sizeIsDeferred}`,
      offset: upload.offset,
      metadata: JSON.stringify(upload.metadata),
      storage: JSON.stringify(upload.storage),
    }
  }
}
