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
        const re = new RegExp('\\' + this.store.path + '\\/([\\w\-]+)\/?'); // eslint-disable-line prefer-template
        const match = req.url.match(re);
        if (!match) {
            return super.send(res, 404);
        }

        const file_id = match[1];
        return this.store.getOffset(file_id)
            .then((file) => {
                // The Server MUST prevent the client and/or proxies from
                // caching the response by adding the Cache-Control: no-store
                // header to the response.
                res.setHeader('Cache-Control', 'no-store');

                // The Server MUST always include the Upload-Offset header in
                // the response for a HEAD request, even if the offset is 0
                res.setHeader('Upload-Offset', file.size);

                if ('upload_length' in file) {
                    // If the size of the upload is known, the Server MUST include
                    // the Upload-Length header in the response.
                    res.setHeader('Upload-Length', file.upload_length);
                }

                if (!('upload_length' in file) && 'upload_defer_length' in file) {
                    //  As long as the length of the upload is not known, the Server
                    //  MUST set Upload-Defer-Length: 1 in all responses to HEAD requests.
                    res.setHeader('Upload-Defer-Length', file.upload_defer_length);
                }

                if ('upload_metadata' in file) {
                    // If the size of the upload is known, the Server MUST include
                    // the Upload-Length header in the response.
                    res.setHeader('Upload-Metadata', file.upload_metadata);
                }

                return res.end();
            })
            .catch((error) => {
                if (Number.isInteger(error)) {
                    return super.send(res, error);
                }

                return super.send(res, 500);
            });
    }
}

module.exports = HeadHandler;
