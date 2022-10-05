import * as storage from '@google-cloud/storage'
import stream from 'node:stream'
import debug from 'debug'

import {ERRORS, TUS_RESUMABLE} from '../constants'
import DataStore from './DataStore'

const {Storage} = storage
const DEFAULT_CONFIG = {
  scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
}
const log = debug('tus-node-server:stores:gcsstore')

class GCSDataStore extends DataStore {
  authConfig: any
  bucket: any
  bucket_name: any
  gcs: any
  constructor(options: any) {
    super(options)
    this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length']
    if (!options.bucket) {
      throw new Error('GCSDataStore must have a bucket')
    }

    this.bucket_name = options.bucket
    this.gcs = new Storage({
      projectId: options.projectId,
      keyFilename: options.keyFilename,
    })
    this.bucket = this._getBucket()
    this.authConfig = Object.assign(DEFAULT_CONFIG, {
      keyFilename: options.keyFilename,
    })
  }

  /**
   * Check the bucket exists in GCS.
   *
   * @return {[type]} [description]
   */
  _getBucket() {
    const bucket = this.gcs.bucket(this.bucket_name)
    bucket.exists((error: any, exists: any) => {
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

  /**
   * Create an empty file in GCS to store the metatdata.
   *
   * @param  {File} file
   * @return {Promise}
   */
  create(file: any) {
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

  /** Get file from GCS storage
   *
   * @param {string} file_id    Name of the file
   *
   * @return {stream.Readable}
   */
  read(file_id: any) {
    return this.bucket.file(file_id).createReadStream()
  }

  /**
   * Get the file metatata from the object in GCS, then upload a new version
   * passing through the metadata to the new version.
   *
   * @param {object} readable stream.Readable
   * @param  {string} file_id Name of file
   * @param  {integer} offset starting offset
   * @return {Promise}
   */
  // @ts-expect-error TS(2416): Property 'write' in type 'GCSDataStore' is not ass... Remove this comment to see the full error message
  write(readable: any, file_id: any, offset: any) {
    // GCS Doesn't persist metadata within versions,
    // get that metadata first
    return this.getOffset(file_id).then((data) => {
      return new Promise((resolve, reject) => {
        const file = this.bucket.file(file_id)
        const destination =
          (data as any).size === 0 ? file : this.bucket.file(`${file_id}_patch`)
        const options = {
          offset,
          metadata: {
            metadata: {
              upload_length: (data as any).upload_length,
              tus_version: TUS_RESUMABLE,
              upload_metadata: (data as any).upload_metadata,
              upload_defer_length: (data as any).upload_defer_length,
            },
          },
        }
        const write_stream = destination.createWriteStream(options)
        if (!write_stream || readable.destroyed) {
          reject(ERRORS.FILE_WRITE_ERROR)
          return
        }

        let bytes_received = (data as any).size
        readable.on('data', (buffer: any) => {
          bytes_received += buffer.length
        })
        stream.pipeline(readable, write_stream, async (e: any) => {
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

  /**
   * Get file metadata from the GCS Object.
   *
   * @param  {string} file_id     name of the file
   * @return {object}
   */
  // @ts-expect-error TS(2416): Property 'getOffset' in type 'GCSDataStore' is not... Remove this comment to see the full error message
  getOffset(file_id: any) {
    return new Promise((resolve, reject) => {
      if (!file_id) {
        reject(ERRORS.FILE_NOT_FOUND)
        return
      }

      const file = this.bucket.file(file_id)
      file.getMetadata((error: any, metadata: any) => {
        if (error && error.code === 404) {
          return reject(ERRORS.FILE_NOT_FOUND)
        }

        if (error) {
          log('[GCSDataStore] getFileMetadata', error)
          return reject(error)
        }

        const data = {
          size: Number.parseInt(metadata.size, 10),
        }
        if (!('metadata' in metadata)) {
          return resolve(data)
        }

        if (metadata.metadata.upload_length) {
          ;(data as any).upload_length = metadata.metadata.upload_length
        }

        if (metadata.metadata.upload_defer_length) {
          ;(data as any).upload_defer_length = metadata.metadata.upload_defer_length
        }

        if (metadata.metadata.upload_metadata) {
          ;(data as any).upload_metadata = metadata.metadata.upload_metadata
        }

        return resolve(data)
      })
    })
  }

  async declareUploadLength(file_id: any, upload_length: any) {
    const metadata = await this.getOffset(file_id)
    ;(metadata as any).upload_length = upload_length
    // NOTE: this needs to be `null` and not `undefined`,
    // GCS has logic that if it's the latter, it will keep the previous value ¯\_(ツ)_/¯
    ;(metadata as any).upload_defer_length = null
    await this.bucket.file(file_id).setMetadata({metadata})
  }
}
export default GCSDataStore
