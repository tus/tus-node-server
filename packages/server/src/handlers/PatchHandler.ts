import debug from 'debug'

import {BaseHandler} from './BaseHandler'
import {ERRORS, EVENTS} from '../constants'

import type http from 'node:http'

const log = debug('tus-node-server:handlers:patch')

export class PatchHandler extends BaseHandler {
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

    const upload = await this.store.getUpload(id)

    // If a Client does attempt to resume an upload which has since
    // been removed by the Server, the Server SHOULD respond with the
    // with the 404 Not Found or 410 Gone status. The latter one SHOULD
    // be used if the Server is keeping track of expired uploads.
    const now = Date.now()
    const creation = upload.creation_date ? new Date(upload.creation_date).getTime() : now
    const expiration = creation + this.store.getExpiration()
    if (
      this.store.hasExtension('expiration') &&
      this.store.getExpiration() > 0 &&
      now > expiration
    ) {
      throw ERRORS.FILE_NO_LONGER_EXISTS
    }

    if (upload.offset !== offset) {
      // If the offsets do not match, the Server MUST respond with the 409 Conflict status without modifying the upload resource.
      log(
        `[PatchHandler] send: Incorrect offset - ${offset} sent but file is ${upload.offset}`
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
      if (upload.size !== undefined) {
        throw ERRORS.INVALID_LENGTH
      }

      if (size < upload.offset) {
        throw ERRORS.INVALID_LENGTH
      }

      await this.store.declareUploadLength(id, size)
      upload.size = size
    }

    const newOffset = await this.store.write(req, id, offset)
    upload.offset = newOffset
    this.emit(EVENTS.POST_RECEIVE, req, res, upload)
    if (newOffset === upload.size && this.options.onUploadFinish) {
      try {
        res = await this.options.onUploadFinish(req, res, upload)
      } catch (error) {
        log(`onUploadFinish: ${error.body}`)
        throw error
      }
    }

    const headers: {
      'Upload-Offset': number
      'Upload-Expires'?: string
    } = {
      'Upload-Offset': newOffset,
    }

    if (
      this.store.hasExtension('expiration') &&
      this.store.getExpiration() > 0 &&
      upload.creation_date &&
      (upload.size === undefined || newOffset < upload.size)
    ) {
      const creation = new Date(upload.creation_date)
      // Value MUST be in RFC 7231 datetime format
      const dateString = new Date(
        creation.getTime() + this.store.getExpiration()
      ).toUTCString()
      headers['Upload-Expires'] = dateString
    }

    // The Server MUST acknowledge successful PATCH requests with the 204
    const writtenRes = this.write(res, 204, headers)

    if (newOffset === upload.size) {
      this.emit(EVENTS.POST_FINISH, req, writtenRes, upload)
    }

    return writtenRes
  }
}
