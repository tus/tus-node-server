'use strict';

const BaseHandler = require('./BaseHandler');
const { ERRORS, EVENTS } = require('../constants');

class DeleteHandler extends BaseHandler {
    /**
     * Removes a file in the DataStore.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        const file_id = this.getFileIdFromRequest(req);
        if (file_id === false) {
            return super.send(res, ERRORS.FILE_NOT_FOUND.status_code, {}, ERRORS.FILE_NOT_FOUND.body);
        }

        return this.store.remove(file_id)
            .then(() => {
                this.emit(EVENTS.EVENT_FILE_DELETED, { file: { id: file_id } });
                return super.send(res, 204, {});
            })
            .catch((error) => {
                const status_code = error.status_code || ERRORS.UNKNOWN_ERROR.status_code;
                const body = error.body || `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`;
                return super.send(res, status_code, {}, body);
            });
    }
}

module.exports = DeleteHandler;
