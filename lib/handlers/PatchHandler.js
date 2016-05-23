'use strict';

const BaseHandler = require('./BaseHandler');
const ERRORS = require('../constants').ERRORS;

class PatchHandler extends BaseHandler {
    /**
     * Write data to the DataStore and return the new offset.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        const re = new RegExp('\\' + this.store.path + '\\/(\\S+)\/?'); // eslint-disable-line prefer-template
        const match = req.url.match(re);
        if (!match) {
            return super.send(res, 404);
        }
        const file_id = match[1];

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
                    console.warn(`[PatchHandler] send: Incorrect offset - ${offset} sent but file is ${stats.size}`);
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
                console.warn('[PatchHandler]', error);
                if ('status_code' in error) {
                    return super.send(res, error.status_code, {}, error.body);
                }

                return super.send(res, ERRORS.UNKNOWN_ERROR.status_code, {}, `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`);
            });
    }
}

module.exports = PatchHandler;
