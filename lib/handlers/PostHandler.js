'use strict';

const File = require('../models/File');
const BaseHandler = require('./BaseHandler');

class PostHandler extends BaseHandler {
    constructor(store) {
        super(store);
    }

    /**
     * Create a file in the DataStore.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        let length = req.headers['upload-length'];
        let deferred_length = req.headers['upload-defer-length'];
        // The request MUST include a Upload-Length or Upload-Defer-Length header
        if (!length && !deferred_length) {
            return super.send(res, 400, { 'Content-Type': 'text/plain' }, `Upload-Length or Upload-Defer-Length required`);
        }

        length = parseInt(length, 10);
        // The value MUST be a non-negative integer.
        if (isNaN(length) || length < 0) {
            return super.send(res, 400, { 'Content-Type': 'text/plain' }, `Upload-Length must be non-negative`);
        }

        let file = new File(length);
        this.store.create(file)
            .then(location => {
                let url = `http://${req.headers.host}${this.store.path}/${file.id}`;
                return super.send(res, 201, { Location: url });
            })
            .catch(error => {
                super.send(res, 404);
            });
    }
}

module.exports = PostHandler;
