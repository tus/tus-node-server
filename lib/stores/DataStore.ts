/* eslint-disable @typescript-eslint/no-unused-vars */
import EventEmitter from 'node:events'

import type stream from 'node:stream'
import type http from 'node:http'
import type {File} from '../../types'

export default class DataStore extends EventEmitter {
  private _extensions: string[] = []

  get extensions() {
    return this._extensions
  }

  set extensions(extensionsArray: string[]) {
    if (!Array.isArray(extensionsArray)) {
      throw new TypeError('DataStore extensions must be an array')
    }

    this._extensions = extensionsArray
  }

  hasExtension(extension: string) {
    return this._extensions && this._extensions.includes(extension)
  }

  /**
   * Called in POST requests. This method just creates a
   * file, implementing the creation extension.
   *
   * http://tus.io/protocols/resumable-upload.html#creation
   */
  async create(file: File) {
    return file
  }

  /**
   * Called in DELETE requests. This method just deletes the file from the store.
   * http://tus.io/protocols/resumable-upload.html#termination
   */
  async remove(file_id: string) {}

  /**
   * Called in PATCH requests. This method should write data
   * to the DataStore file, and possibly implement the
   * concatenation extension.
   *
   * http://tus.io/protocols/resumable-upload.html#concatenation
   */
  async write(
    stream: http.IncomingMessage | stream.Readable,
    file_id: string,
    offset: number
  ) {
    return 0
  }

  /**
   * Called in HEAD requests. This method should return the bytes
   * writen to the DataStore, for the client to know where to resume
   * the upload.
   */
  async getOffset(file_id: string): Promise<File> {
    return {id: file_id, size: 0, upload_length: '0'}
  }

  /**
   * Called in PATCH requests when upload length is known after being defered.
   */
  async declareUploadLength(file_id: string, upload_length: string) {}

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
