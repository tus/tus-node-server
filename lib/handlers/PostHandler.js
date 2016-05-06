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
        let length = req.headers['upload-length'];
        const deferred_length = req.headers['upload-defer-length'];
        // The request MUST include a Upload-Length or Upload-Defer-Length header
        if (!length && !deferred_length) {
            return super.send(res, 400);
        }

        length = parseInt(length, 10);
        // The value MUST be a non-negative integer.
        if (isNaN(length) || length < 0) {
            return super.send(res, 400);
        }

        length = parseInt(length, 10);
        // The Upload-Defer-Length value MUST be 1.
        if (deferred_length && deferred_length !== '1') {
            return super.send(res, 400);
        }

        const file = new File(length);
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
