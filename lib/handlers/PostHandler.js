'use strict';

const File = require('../models/File');
const BaseHandler = require('./BaseHandler');

class PostHandler extends BaseHandler {
    /**
     * Create a file in the DataStore.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        const upload_length = req.headers['upload-length'];
        const upload_defer_length = req.headers['upload-defer-length'];
        // The request MUST include a Upload-Length or Upload-Defer-Length header
        if (upload_length === undefined && upload_defer_length === undefined) {
            return super.send(res, 400, {}, 'Upload-Length or Upload-Defer-Length Required');
        }

        // The value MUST be a non-negative integer.
        if (upload_length && (isNaN(upload_length) || parseInt(upload_length, 10) < 0)) {
            console.warn(`[PostHandler] Invalid Upload-Length: ${upload_length}`);
            return super.send(res, 400, {}, 'Invalid Upload-Length');
        }

        // The Upload-Defer-Length value MUST be 1.
        if (upload_defer_length && (isNaN(upload_defer_length) || parseInt(upload_defer_length, 10) !== 1)) {
            console.warn(`[PostHandler] Invalid Upload-Defer-Length: ${upload_defer_length}`);
            return super.send(res, 400, {}, 'Invalid Upload-Defer-Length');
        }

        const file = new File(upload_length, upload_defer_length);
        return this.store.create(file)
            .then((location) => {
                const url = `http://${req.headers.host}${this.store.path}/${file.id}`;
                return super.send(res, 201, { Location: url });
            })
            .catch((error) => {
                if (Number.isInteger(error)) {
                    return super.send(res, error);
                }

                return super.send(res, 500);
            });
    }
}

module.exports = PostHandler;
