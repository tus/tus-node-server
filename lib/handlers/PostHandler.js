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
        const length = req.headers['upload-length'];
        const defer_length = req.headers['upload-defer-length'];
        // The request MUST include a Upload-Length or Upload-Defer-Length header
        if (length === undefined && defer_length === undefined) {
            return super.send(res, 400, {}, 'Upload-Length or Upload-Defer-Length Required');
        }

        // The value MUST be a non-negative integer.
        if (length && (isNaN(length) || parseInt(length, 10) < 0)) {
            console.warn(`[PostHandler] Invalid Upload-Length: ${length}`)
            return super.send(res, 400, {}, 'Invalid Upload-Length');
        }

        // The Upload-Defer-Length value MUST be 1.
        if (defer_length && (isNaN(defer_length) || parseInt(defer_length, 10) !== 1)) {
            console.warn(`[PostHandler] Invalid Upload-Defer-Length: ${defer_length}`)
            return super.send(res, 400, {}, 'Invalid Upload-Defer-Length');
        }

        const file = new File(length, defer_length);
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
