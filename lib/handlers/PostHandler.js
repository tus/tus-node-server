'use strict';

const BaseHandler = require('./BaseHandler');
const RequestValidator = require('../validators/RequestValidator');
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
            .then(async(File) => {
                const relativeLocation = (`${req.baseUrl || ''}${this.store.path.trim()}/${File.id}`)
                    .replace(new RegExp('/{1,}', 'g'), '/');
                /* eslint-disable-next-line */
                const absoluteLocation = '//' + (`${req.headers.host}${req.baseUrl || ''}${this.store.path.trim()}/${File.id}`)
                    .replace(new RegExp('/{1,}', 'g'), '/');
                const url = this.store.relativeLocation ? relativeLocation : absoluteLocation;

                this.emit(EVENT_ENDPOINT_CREATED, { url });

                const optional_headers = {};

                // The request MIGHT include a Content-Type header when using creation-with-upload extension
                if (!RequestValidator.isInvalidHeader('content-type', req.headers['content-type'])) {
                    const new_offset = await this.store.write(req, File.id, 0);
                    optional_headers['Upload-Offset'] = new_offset;
                }

                return super.send(res, 201, { Location: url, ...optional_headers });
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
