import {BaseHandler} from './BaseHandler.js'
import {ERRORS, EVENTS, type CancellationContext} from '@tus/utils'

export class DeleteHandler extends BaseHandler {
  async send(req: Request, context: CancellationContext, headers = new Headers()) {
    const id = this.getFileIdFromRequest(req)
    if (!id) {
      throw ERRORS.FILE_NOT_FOUND
    }

    if (this.options.onIncomingRequest) {
      await this.options.onIncomingRequest(req, id)
    }

    const lock = await this.acquireLock(req, id, context)
    try {
      if (this.options.disableTerminationForFinishedUploads) {
        const upload = await this.store.getUpload(id)
        if (upload.offset === upload.size) {
          throw ERRORS.INVALID_TERMINATION
        }
      }

      await this.store.remove(id)
    } finally {
      await lock.unlock()
    }
    const writtenRes = this.write(204, headers)
    this.emit(EVENTS.POST_TERMINATE, req, writtenRes, id)
    return writtenRes
  }
}
