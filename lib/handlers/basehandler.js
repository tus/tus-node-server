'use strict';

class BaseHandler {
    constructor() {
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
        body = body ? body : '';
        headers = Object.assign(headers, {
            'Content-Length': body.length,
        });
        res.writeHead(status, headers);
        res.write(body);
        return res.end();
    }
}

module.exports = BaseHandler;
