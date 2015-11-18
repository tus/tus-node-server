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
     * Create a file in the DataStore if the entity length is specified.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        let length = req.headers['entity-length'];
        // The request MUST include a Entity-Length header
        if (!length) {
            return super.send(res, 400, { 'Content-Type': 'text/plain' }, `Entity-Length Required`);
        }

        length = parseInt(length, 10);
        // The value MUST be a non-negative integer.
        if (isNaN(length) || length < 0) {
            return super.send(res, 400, { 'Content-Type': 'text/plain' }, `Entity-Length must be non-negative`);
        }

        let file = new File(length);
        this.store.create(file);
        return super.send(res, 201, file.getHeaders(req.headers.host, this.store.path));
    }
}

module.exports = PostHandler;
