'use strict';

const BaseHandler = require('./BaseHandler');
const ALLOWED_METHODS = 'POST, HEAD, PATCH, OPTIONS';
const ALLOWED_HEADERS = 'Origin, X-Requested-With, Content-Type, Upload-Length, Upload-Offset, Tus-Resumable, Upload-Metadata';
const MAX_AGE = 86400;

class OptionsHandler extends BaseHandler {
    constructor(store) {
        super();

        this.store = store;
    }

    /**
     *
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        // Preflight request
        res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
        res.setHeader('Access-Control-Max-Age', MAX_AGE);

        return super.send(res, 201, {});
    }
}

module.exports = OptionsHandler;
