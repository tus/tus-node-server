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
    async send(req, res) {
        const file_id = this.getFileIdFromRequest(req);
        if (file_id === false) {
            throw ERRORS.FILE_NOT_FOUND;
        }

        await this.store.remove(file_id);
        this.emit(EVENTS.EVENT_FILE_DELETED, { file_id });

        return this.write(res, 204, {});
    }
}

module.exports = DeleteHandler;
