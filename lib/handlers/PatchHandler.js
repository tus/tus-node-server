'use strict';

const BaseHandler = require('./BaseHandler');
const File = require('../models/File');
const { ERRORS, EVENTS } = require('../constants');
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
    async send(req, res) {
        const file_id = this.getFileIdFromRequest(req);
        if (file_id === false) {
            throw ERRORS.FILE_NOT_FOUND;
        }

        // The request MUST include a Upload-Offset header
        let offset = req.headers['upload-offset'];
        if (offset === undefined) {
            throw ERRORS.MISSING_OFFSET;
        }

        // The request MUST include a Content-Type header
        const content_type = req.headers['content-type'];
        if (content_type === undefined) {
            throw ERRORS.INVALID_CONTENT_TYPE;
        }

        offset = parseInt(offset, 10);

        const stats = await this.store.getOffset(file_id);
        if (stats.size !== offset) {
            // If the offsets do not match, the Server MUST respond with the 409 Conflict status without modifying the upload resource.
            log(`[PatchHandler] send: Incorrect offset - ${offset} sent but file is ${stats.size}`);
            throw ERRORS.INVALID_OFFSET;
        }

        const new_offset = await this.store.write(req, file_id, offset)
        if (`${new_offset}` === stats.upload_length) {
            this.emit(EVENTS.EVENT_UPLOAD_COMPLETE, { file: new File(file_id, stats.upload_length, stats.upload_defer_length, stats.upload_metadata) });
        }

        //  It MUST include the Upload-Offset header containing the new offset.
        const headers = {
            'Upload-Offset': new_offset,
        };

        // The Server MUST acknowledge successful PATCH requests with the 204
        return this.write(res, 204, headers);
    }
}

module.exports = PatchHandler;
