import {BaseHandler} from './BaseHandler.js'

import {ERRORS, Metadata, type Upload, type CancellationContext} from '@tus/utils'

export class HeadHandler extends BaseHandler {
  async send(req: Request, context: CancellationContext, headers = new Headers()) {
    const id = this.getFileIdFromRequest(req)
    if (!id) {
      throw ERRORS.FILE_NOT_FOUND
    }

    if (this.options.onIncomingRequest) {
      await this.options.onIncomingRequest(req, id)
    }

    const lock = await this.acquireLock(req, id, context)

    let file: Upload
    try {
      file = await this.store.getUpload(id)
    } finally {
      await lock.unlock()
    }

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

    const res = new Response('', {status: 200, headers})

    // The Server MUST prevent the client and/or proxies from
    // caching the response by adding the Cache-Control: no-store
    // header to the response.
    res.headers.set('Cache-Control', 'no-store')
    // The Server MUST always include the Upload-Offset header in
    // the response for a HEAD request, even if the offset is 0
    res.headers.set('Upload-Offset', file.offset.toString())

    if (file.sizeIsDeferred) {
      // As long as the length of the upload is not known, the Server
      // MUST set Upload-Defer-Length: 1 in all responses to HEAD requests.
      res.headers.set('Upload-Defer-Length', '1')
    } else {
      // If the size of the upload is known, the Server MUST include
      // the Upload-Length header in the response.
      res.headers.set('Upload-Length', (file.size as number).toString())
    }

    if (file.metadata !== undefined) {
      // If an upload contains additional metadata, responses to HEAD
      // requests MUST include the Upload-Metadata header and its value
      // as specified by the Client during the creation.
      res.headers.set('Upload-Metadata', Metadata.stringify(file.metadata) as string)
    }

    return res
  }
}
