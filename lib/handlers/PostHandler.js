'use strict';

const File = require('../models/File');
const BaseHandler = require('./BaseHandler');

class PostHandler extends BaseHandler {
    /**
     * Create a file in the DataStore.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {

        const upload_length = req.headers['upload-length'];
        const upload_defer_length = req.headers['upload-defer-length'];
        const upload_metadata = req.headers['upload-metadata'];

        // The request MUST include a Upload-Length or Upload-Defer-Length header
        if (upload_length === undefined && upload_defer_length === undefined) {
            return super.send(res, 412, {}, 'Upload-Length or Upload-Defer-Length Required\n');
        }

        const file = new File(upload_length, upload_defer_length, upload_metadata);
        return this.store.create(file)
            .then((location) => {
                const url = `http://${req.headers.host}${this.store.path}/${file.id}`;
                return super.send(res, 201, { Location: url });
            })
            .catch((error) => {
                if (Number.isInteger(error)) {
                    return super.send(res, error);
                }

                return super.send(res, 500);
            });
    }
}

module.exports = PostHandler;
