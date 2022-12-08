import {BaseHandler} from './BaseHandler'
import {ERRORS, EVENTS} from '../constants'

import type http from 'node:http'

export class DeleteHandler extends BaseHandler {
  async send(req: http.IncomingMessage, res: http.ServerResponse) {
    const id = this.getFileIdFromRequest(req)
    if (id === false) {
      throw ERRORS.FILE_NOT_FOUND
    }

    await this.store.remove(id)
    const writtenRes = this.write(res, 204, {})
    this.emit(EVENTS.POST_TERMINATE, req, writtenRes, id)
    return writtenRes
  }
}
