'use strict';

const BaseHandler = require('./BaseHandler');

class PatchHandler extends BaseHandler {
    constructor(store) {
        super(store);
    }

    /**
     * Write data to the DataStore and return the new offset.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        const re = new RegExp('\\' + this.store.path + '\\/(\\w+)\/?');
        const match = req.url.match(re);
        if (!match) {
            return super.send(res, 404);
        }

        const file_name = match[1];

        let offset = req.headers['upload-offset'];
        // The request MUST include a Upload-Offset header
        if (!offset) {
            return super.send(res, 409);
        }

        offset = parseInt(offset, 10);
        // The value MUST be a non-negative integer.
        if (isNaN(offset) || offset < 0) {
            return super.send(res, 400, { 'Content-Type': 'text/plain' }, `Upload-Offset must be non-negative`);
        }

        this.store.write(req, file_name, offset).then((new_offset) => {
            return super.send(res, 201, { 'Upload-Offset': new_offset });
        })
        .catch(error => {
            console.log(error);
            super.send(res, 404);
        });
    }
}

module.exports = PatchHandler;
