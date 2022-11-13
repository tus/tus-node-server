import BaseHandler from './BaseHandler'
import {ERRORS, EVENTS} from '../constants'

import type http from 'node:http'

export default class DeleteHandler extends BaseHandler {
  async send(req: http.IncomingMessage, res: http.ServerResponse) {
    const id = this.getFileIdFromRequest(req)
    if (id === false) {
      throw ERRORS.FILE_NOT_FOUND
    }

    await this.store.remove(id)
    this.emit(EVENTS.EVENT_FILE_DELETED, {file_id: id})
    return this.write(res, 204, {})
  }
}
