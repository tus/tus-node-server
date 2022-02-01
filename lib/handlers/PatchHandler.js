'use strict';

const BaseHandler = require('./BaseHandler');
const ERRORS = require('../constants').ERRORS;
const debug = require('debug');
const log = debug('tus-node-server:handlers:patch');
class PatchHandler extends BaseHandler {
    /**
     * Write data to the DataStore and return the new offset.
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

        // The request MUST include a Upload-Offset header
        let offset = req.headers['upload-offset'];
        if (offset === undefined) {
            return super.send(res, ERRORS.MISSING_OFFSET.status_code, {}, ERRORS.MISSING_OFFSET.body);
        }

        // The request MUST include a Content-Type header
        const content_type = req.headers['content-type'];
        if (content_type === undefined) {
            return super.send(res, ERRORS.INVALID_CONTENT_TYPE.status_code, {}, ERRORS.INVALID_CONTENT_TYPE.body);
        }

        offset = parseInt(offset, 10);

        return this.store.getOffset(file_id)
            .then((stats) => {
                if (stats.size !== offset) {
                    // If the offsets do not match, the Server MUST respond with the 409 Conflict status without modifying the upload resource.
                    log(`[PatchHandler] send: Incorrect offset - ${offset} sent but file is ${stats.size}`);
                    return Promise.reject(ERRORS.INVALID_OFFSET);
                }

                return this.store.write(req, file_id, offset);
            })
            .then((new_offset) => {
                //  It MUST include the Upload-Offset header containing the new offset.
                const headers = {
                    'Upload-Offset': new_offset,
                };
                // The Server MUST acknowledge successful PATCH requests with the 204
                return super.send(res, 204, headers);
            })
            .catch((error) => {
                log('[PatchHandler]', error);
                const status_code = error.status_code || ERRORS.UNKNOWN_ERROR.status_code;
                const body = error.body || `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`;
                return super.send(res, status_code, {}, body);
            });
    }
}

module.exports = PatchHandler;
