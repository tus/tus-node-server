'use strict';

const BaseHandler = require('./BaseHandler');
const ERRORS = require('../constants').ERRORS;
const EVENT_ENDPOINT_CREATED = require('../constants').EVENT_ENDPOINT_CREATED;
const debug = require('debug');
const log = debug('tus-node-server:handlers:post');
class PostHandler extends BaseHandler {
    /**
     * Create a file in the DataStore.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        return this.store.create(req)
            .then((File) => {
                const url = `//${req.headers.host}${req.baseUrl || ''}${this.store.path}/${File.id}`;
                this.emit(EVENT_ENDPOINT_CREATED, { url });
                return super.send(res, 201, { Location: url });
            })
            .catch((error) => {
                log('[PostHandler]', error);
                const status_code = error.status_code || ERRORS.UNKNOWN_ERROR.status_code;
                const body = error.body || `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`;
                return super.send(res, status_code, {}, body);
            });
    }
}

module.exports = PostHandler;
