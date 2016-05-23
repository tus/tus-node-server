'use strict';

const BaseHandler = require('./BaseHandler');
const ERRORS = require('../constants').ERRORS;

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
                const url = `http://${req.headers.host}${this.store.path}/${File.id}`;
                return super.send(res, 201, { Location: url });
            })
            .catch((error) => {
                console.warn('[PostHandler]', error);
                if ('status_code' in error) {
                    return super.send(res, error.status_code, {}, error.body);
                }

                return super.send(res, ERRORS.UNKNOWN_ERROR.status_code, {}, `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`);
            });
    }
}

module.exports = PostHandler;
