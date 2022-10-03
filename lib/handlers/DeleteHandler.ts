import BaseHandler from './BaseHandler'
import { ERRORS, EVENTS } from '../constants'
class DeleteHandler extends BaseHandler {
  emit: any
  /**
   * Removes a file in the DataStore.
   *
   * @param  {object} req http.incomingMessage
   * @param  {object} res http.ServerResponse
   * @return {function}
   */
  async send(req: any, res: any) {
    const file_id = this.getFileIdFromRequest(req)
    if (file_id === false) {
      throw ERRORS.FILE_NOT_FOUND
    }
    await this.store.remove(file_id)
    this.emit(EVENTS.EVENT_FILE_DELETED, { file_id })
    // @ts-expect-error TS(2554): Expected 4 arguments, but got 3.
    return this.write(res, 204, {})
  }
}
export default DeleteHandler
