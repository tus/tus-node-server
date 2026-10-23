import EventEmitter from 'node:events'
import type stream from 'node:stream'

import {Upload} from './Upload.js'

export class DataStore extends EventEmitter {
  extensions: string[] = []

  hasExtension(extension: string) {
    return this.extensions?.includes(extension)
  }

  /**
   * Called in POST requests. This method just creates a
   * file, implementing the creation extension.
   *
   * http://tus.io/protocols/resumable-upload.html#creation
   */
  async create(file: Upload) {
    return file
  }

  /**
   * Called in DELETE requests. This method just deletes the file from the store.
   * http://tus.io/protocols/resumable-upload.html#termination
   */
  async remove(_id: string) {}

  /**
   * Called in POST and PATCH requests to write data and return the new offset.
   * A POST with Upload-Length: 0 passes an empty stream at offset 0.
   * When the returned offset reaches the declared size, the stored upload
   * must be complete.
   */
  async write(_stream: stream.Readable, _id: string, _offset: number) {
    return 0
  }

  /**
   * Called in HEAD requests. This method should return the bytes
   * writen to the DataStore, for the client to know where to resume
   * the upload.
   */
  async getUpload(id: string): Promise<Upload> {
    return new Upload({
      id,
      size: 0,
      offset: 0,
      storage: {type: 'datastore', path: ''},
    })
  }

  /**
   * Called in PATCH requests when upload length is known after being defered.
   */
  async declareUploadLength(_id: string, _upload_length: number) {}

  /**
   * Returns number of expired uploads that were deleted.
   */
  async deleteExpired(): Promise<number> {
    return 0
  }

  getExpiration(): number {
    return 0
  }
}
