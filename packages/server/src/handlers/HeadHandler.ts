import {BaseHandler} from './BaseHandler'

import {ERRORS} from '../constants'
import {Metadata} from '../models'

import type http from 'node:http'

export class HeadHandler extends BaseHandler {
  async send(req: http.IncomingMessage, res: http.ServerResponse) {
    const id = this.getFileIdFromRequest(req)
    if (id === false) {
      throw ERRORS.FILE_NOT_FOUND
    }

    const file = await this.store.getUpload(id)

    // If a Client does attempt to resume an upload which has since
    // been removed by the Server, the Server SHOULD respond with the
    // with the 404 Not Found or 410 Gone status. The latter one SHOULD
    // be used if the Server is keeping track of expired uploads.
    const now = new Date()
    if (
      this.store.hasExtension('expiration') &&
      this.store.getExpiration() > 0 &&
      file.creation_date &&
      now > new Date(new Date(file.creation_date).getTime() + this.store.getExpiration())
    ) {
      throw ERRORS.FILE_NO_LONGER_EXISTS
    }

    // The Server MUST prevent the client and/or proxies from
    // caching the response by adding the Cache-Control: no-store
    // header to the response.
    res.setHeader('Cache-Control', 'no-store')
    // The Server MUST always include the Upload-Offset header in
    // the response for a HEAD request, even if the offset is 0
    res.setHeader('Upload-Offset', file.offset)

    if (file.sizeIsDeferred) {
      // As long as the length of the upload is not known, the Server
      // MUST set Upload-Defer-Length: 1 in all responses to HEAD requests.
      res.setHeader('Upload-Defer-Length', '1')
    } else {
      // If the size of the upload is known, the Server MUST include
      // the Upload-Length header in the response.
      res.setHeader('Upload-Length', file.size as number)
    }

    if (file.metadata !== undefined) {
      // If the size of the upload is known, the Server MUST include
      // the Upload-Length header in the response.
      res.setHeader('Upload-Metadata', Metadata.stringify(file.metadata) as string)
    }

    return res.end()
  }
}
