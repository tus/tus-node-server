'use strict';

const BaseHandler = require('./BaseHandler');

class PatchHandler extends BaseHandler {
    /**
     * Write data to the DataStore and return the new offset.
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

        const file_name = match[1];

        // The request MUST include a Upload-Offset header
        let offset = req.headers['upload-offset'];
        offset = parseInt(offset, 10);
        if (isNaN(offset) || offset < 0) {
            return super.send(res, 403);
        }

        return this.store.write(req, file_name, offset).then((new_offset) => {
            return super.send(res, 204, { 'Upload-Offset': new_offset });
        })
        .catch((error) => {
            console.log(error);
            super.send(res, 404);
        });
    }
}

module.exports = PatchHandler;
