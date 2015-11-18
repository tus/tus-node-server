'use strict';

const EXPOSED_HEADERS = 'Upload-Offset, Location, Upload-Length, Tus-Version, Tus-Resumable, Tus-Max-Size, Tus-Extension, Upload-Metadata';

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
            'Access-Control-Expose-Headers': EXPOSED_HEADERS,
        });

        res.writeHead(status, headers);
        res.write(body);
        return res.end();
    }
}

module.exports = BaseHandler;
