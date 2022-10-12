import type http from 'node:http'

import BaseHandler from './BaseHandler'
import {ERRORS, EVENTS} from '../constants'

export default class DeleteHandler extends BaseHandler {
  async send(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<http.ServerResponse> {
    const file_id = this.getFileIdFromRequest(req)
    if (file_id === false) {
      throw ERRORS.FILE_NOT_FOUND
    }

    await this.store.remove(file_id)
    this.emit(EVENTS.EVENT_FILE_DELETED, {file_id})
    return this.write(res, 204, {})
  }
}
