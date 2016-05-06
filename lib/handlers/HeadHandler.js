'use strict';

const BaseHandler = require('./BaseHandler');

class HeadHandler extends BaseHandler {
    /**
     * Send the bytes received for a given file.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        const re = new RegExp('\\' + this.store.path + '\\/(\\w+)\/?'); // eslint-disable-line prefer-template
        const match = req.url.match(re);
        if (!match) {
            return super.send(res, 404);
        }

        // The request MUST include a Upload-Offset header
        let offset = req.headers['upload-offset'];
        offset = parseInt(offset, 10);
        if (isNaN(offset) || offset < 0) {
            return super.send(res, 403);
        }

        const file_name = match[1];
        return this.store.getOffset(file_name)
            .then((stats) => {
                // The Server MUST prevent the client and/or proxies from caching the response by adding the Cache-Control: no-store header to the response.
                res.setHeader('Cache-Control', 'no-store');

                // If the size of the upload is known, the Server MUST include the Upload-Length header in the response.
                res.setHeader('Upload-Length', stats.size);
                return res.end();
            })
            .catch((error) => {
                if (Number.isInteger(error)) {
                    return super.send(res, error);
                }

                return super.send(res, 404);
            });
    }
}

module.exports = HeadHandler;
