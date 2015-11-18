'use strict';

const File = require('../models/File');
const DataStore = require('../stores/DataStore');
const BaseHandler = require('./BaseHandler');

class PostHandler extends BaseHandler {
    constructor(store) {
        super();
        if (!(store instanceof DataStore)) {
            throw new Error('PostHandler datastore must adhere to DataStore interface');
        }

        this.store = store;
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
        // The request MUST include a Entity-Length or Upload-Defer-Length header
        if (!length && !deferred_length) {
            return super.send(res, 400, { 'Content-Type': 'text/plain' }, `Upload-Length or Upload-Defer-Length required`);
        }

        length = parseInt(length, 10);
        // The value MUST be a non-negative integer.
        if (isNaN(length) || length < 0) {
            return super.send(res, 400, { 'Content-Type': 'text/plain' }, `Upload-Length must be non-negative`);
        }

        let file = new File(length);
        this.store.create(file);
        return super.send(res, 201, file.getHeaders(req.headers.host, this.store.path));
    }
}

module.exports = PostHandler;
