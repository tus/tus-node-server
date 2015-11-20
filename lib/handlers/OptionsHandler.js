'use strict';

const BaseHandler = require('./BaseHandler');
const ALLOWED_METHODS = 'POST, HEAD, PATCH, OPTIONS';
const ALLOWED_HEADERS = 'Upload-Offset, X-Requested-With, Tus-Version, Tus-Resumable, Tus-Extension, Tus-Max-Size, X-HTTP-Method-Override';
const MAX_AGE = 86400;

class OptionsHandler extends BaseHandler {
    constructor(store) {
        super(store);
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

        if (this.store.extensions) {
            res.setHeader('Tus-Extension', this.store.extensions);
        }

        return super.send(res, 204);
    }
}

module.exports = OptionsHandler;
