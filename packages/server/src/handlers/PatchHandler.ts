import debug from 'debug'
import {Readable} from 'node:stream'

import {BaseHandler} from './BaseHandler.js'

import {ERRORS, EVENTS, type CancellationContext, type Upload} from '@tus/utils'

const log = debug('tus-node-server:handlers:patch')

export class PatchHandler extends BaseHandler {
  /**
   * Write data to the DataStore and return the new offset.
   */
  async send(req: Request, context: CancellationContext, headers = new Headers()) {
    try {
      const id = this.getFileIdFromRequest(req)
      if (!id) {
        throw ERRORS.FILE_NOT_FOUND
      }

      // The request MUST include a Upload-Offset header
      if (req.headers.get('upload-offset') === null) {
        throw ERRORS.MISSING_OFFSET
      }

      const offset = Number.parseInt(req.headers.get('upload-offset') as string, 10)

      // The request MUST include a Content-Type header
      const content_type = req.headers.get('content-type')
      if (content_type === null) {
        throw ERRORS.INVALID_CONTENT_TYPE
      }

      if (this.options.onIncomingRequest) {
        await this.options.onIncomingRequest(req, id)
      }

      const maxFileSize = await this.getConfiguredMaxSize(req, id)

      const lock = await this.acquireLock(req, id, context)

      let upload: Upload
      let newOffset: number
      try {
        upload = await this.store.getUpload(id)

        // If a Client does attempt to resume an upload which has since
        // been removed by the Server, the Server SHOULD respond with the
        // with the 404 Not Found or 410 Gone status. The latter one SHOULD
        // be used if the Server is keeping track of expired uploads.
        const now = Date.now()
        const creation = upload.creation_date
          ? new Date(upload.creation_date).getTime()
          : now
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
        const upload_length = req.headers.get('upload-length')
        if (upload_length !== null) {
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

          if (maxFileSize > 0 && size > maxFileSize) {
            throw ERRORS.ERR_MAX_SIZE_EXCEEDED
          }

          await this.store.declareUploadLength(id, size)
          upload.size = size
        }

        const maxBodySize = await this.calculateMaxBodySize(req, upload, maxFileSize)
        newOffset = await this.writeToStore(req.body, upload, maxBodySize, context)
      } finally {
        await lock.unlock()
      }

      upload.offset = newOffset

      //Recommended response defaults
      const responseData = {
        status: 204,
        headers: {
          ...Object.fromEntries(headers.entries()),
          'Upload-Offset': newOffset.toString(),
        } as Record<string, string | number>,
        body: '',
      }

      if (newOffset === upload.size && this.options.onUploadFinish) {
        try {
          const hookResponse = await this.options.onUploadFinish(req, upload)
          if (hookResponse) {
            const {status_code, body, headers} = hookResponse
            if (status_code) responseData.status = status_code
            if (body) responseData.body = body
            if (headers)
              responseData.headers = Object.assign(responseData.headers, headers)
          }
        } catch (error) {
          log(`onUploadFinish: ${error.body}`)
          throw error
        }
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
        responseData.headers['Upload-Expires'] = dateString
      }

      // The Server MUST acknowledge successful PATCH requests with the 204
      const writtenRes = this.write(
        responseData.status,
        responseData.headers,
        responseData.body
      )

      if (newOffset === upload.size) {
        this.emit(EVENTS.POST_FINISH, req, writtenRes, upload)
      }

      return writtenRes
    } catch (e) {
      // Only abort the context if it wasn't already aborted
      if (!context.signal.aborted) {
        context.abort()
      }
      throw e
    }
  }
}
