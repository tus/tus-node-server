'use strict';

const DataStore = require('../stores/DataStore');
const EventEmitter = require('events');


class BaseHandler extends EventEmitter {
    constructor(store) {
        super();
        if (!(store instanceof DataStore)) {
            throw new Error(`${store} is not a DataStore`);
        }
        this.store = store;
    }

    /**
     * Wrapper on http.ServerResponse.
     *
     * @param  {object} res http.ServerResponse
     * @param  {integer} status
     * @param  {object} headers
     * @param  {string} body
     * @return {ServerResponse}
     */
    send(res, status, headers, body) {
        headers = headers ? headers : {};
        body = body ? body : '';
        headers = Object.assign(headers, {
            'Content-Length': body.length,
        });

        res.writeHead(status, headers);
        res.write(body);
        return res.end();
    }

    /**
     * Extract the file id from the request
     *
     * @param  {object} req http.incomingMessage
     * @return {bool|string}
     */
    getFileIdFromRequest(req) {
        const re = new RegExp(`${req.baseUrl || ''}${this.store.path}\\/(\\S+)\\/?`); // eslint-disable-line prefer-template
        const match = (req.originalUrl || req.url).match(re);
        if (!match) {
            return false;
        }

        const file_id = match[1];
        return file_id;
    }

}

module.exports = BaseHandler;
