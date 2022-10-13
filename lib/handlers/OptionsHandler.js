'use strict';

const BaseHandler = require('./BaseHandler');
const { ALLOWED_METHODS, ALLOWED_HEADERS, MAX_AGE } = require('../constants');

// A successful response indicated by the 204 No Content status MUST contain
// the Tus-Version header. It MAY include the Tus-Extension and Tus-Max-Size headers.

class OptionsHandler extends BaseHandler {
    /**
     *
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    async send(req, res) {
        // Preflight request
        res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);

        res.setHeader('Access-Control-Max-Age', MAX_AGE);

        if (this.store.extensions) {
            res.setHeader('Tus-Extension', this.store.extensions);
        }

        return this.write(res, 204);
    }
}

module.exports = OptionsHandler;
