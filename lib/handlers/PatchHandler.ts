import debug from 'debug'

import BaseHandler from './BaseHandler'
import {ERRORS, EVENTS} from '../constants'

import type http from 'node:http'

const log = debug('tus-node-server:handlers:patch')

export default class PatchHandler extends BaseHandler {
  /**
   * Write data to the DataStore and return the new offset.
   */
  async send(req: http.IncomingMessage, res: http.ServerResponse) {
    const id = this.getFileIdFromRequest(req)
    if (id === false) {
      throw ERRORS.FILE_NOT_FOUND
    }

    // The request MUST include a Upload-Offset header
    if (req.headers['upload-offset'] === undefined) {
      throw ERRORS.MISSING_OFFSET
    }

    const offset = Number.parseInt(req.headers['upload-offset'] as string, 10)

    // The request MUST include a Content-Type header
    const content_type = req.headers['content-type']
    if (content_type === undefined) {
      throw ERRORS.INVALID_CONTENT_TYPE
    }

    const file = await this.store.getUpload(id)

    // If a Client does attempt to resume an upload which has since
    // been removed by the Server, the Server SHOULD respond with the
    // with the 404 Not Found or 410 Gone status. The latter one SHOULD
    // be used if the Server is keeping track of expired uploads.
    const creation = file.creation_date ? new Date(file.creation_date) : new Date()
    const expiration = new Date(creation.getTime() + this.store.getExpiration())
    const now = new Date()
    if (
      this.store.hasExtension('expiration') &&
      this.store.getExpiration() > 0 &&
      now > expiration
    ) {
      throw ERRORS.FILE_NO_LONGER_EXISTS
    }

    if (file.offset !== offset) {
      // If the offsets do not match, the Server MUST respond with the 409 Conflict status without modifying the upload resource.
      log(
        `[PatchHandler] send: Incorrect offset - ${offset} sent but file is ${file.offset}`
      )
      throw ERRORS.INVALID_OFFSET
    }

    // The request MUST validate upload-length related headers
    const upload_length = req.headers['upload-length'] as string | undefined
    if (upload_length !== undefined) {
      const size = Number.parseInt(upload_length, 10)
      // Throw error if extension is not supported
      if (!this.store.hasExtension('creation-defer-length')) {
        throw ERRORS.UNSUPPORTED_CREATION_DEFER_LENGTH_EXTENSION
      }

      // Throw error if upload-length is already set.
      if (file.size !== undefined) {
        throw ERRORS.INVALID_LENGTH
      }

      if (size < file.offset) {
        throw ERRORS.INVALID_LENGTH
      }

      await this.store.declareUploadLength(id, size)
      file.size = size
    }

    const new_offset = await this.store.write(req, id, offset)
    if (new_offset === file.size) {
      this.emit(EVENTS.EVENT_UPLOAD_COMPLETE, {file})
    }

    const headers: {
      'Upload-Offset': number
      'Upload-Expires'?: string
    } = {
      'Upload-Offset': new_offset,
    }

    if (
      this.store.hasExtension('expiration') &&
      this.store.getExpiration() > 0 &&
      file.creation_date &&
      (file.size === undefined || new_offset < file.size)
    ) {
      const creation = new Date(file.creation_date)
      // Value MUST be in RFC 7231 datetime format
      const dateString = new Date(
        creation.getTime() + this.store.getExpiration()
      ).toUTCString()
      headers['Upload-Expires'] = dateString
    }

    // The Server MUST acknowledge successful PATCH requests with the 204
    return this.write(res, 204, headers)
  }
}
