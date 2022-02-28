'use strict';

const BaseHandler = require('./BaseHandler');
const ERRORS = require('../constants').ERRORS;

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
        if (!file_id) {
            console.warn('[DeleteHandler]: not a valid path');
            return Promise.resolve(super.send(res, 404, {}, 'Invalid path name\n'));
        }
        req.file_id = file_id;
        return this.store.remove(req)
            .then(() => {
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
