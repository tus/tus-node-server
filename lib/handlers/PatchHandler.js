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
        const re = new RegExp('\\' + this.store.path + '\\/(\\S+)\/?'); // eslint-disable-line prefer-template
        const match = req.url.match(re);
        if (!match) {
            return super.send(res, 404);
        }
        const file_id = match[1];

        // The request MUST include a Upload-Offset header
        let offset = req.headers['upload-offset'];
        if (offset === undefined) {
            return super.send(res, 403, {}, 'Upload-Offset Required\n');
        }

        // The request MUST include a Content-Type header
        const content_type = req.headers['content-type'];
        if (content_type === undefined) {
            return super.send(res, 403, {}, 'Content-Type Required\n');
        }

        offset = parseInt(offset, 10);

        return this.store.getOffset(file_id)
            .then((stats) => {
                if (stats.size !== offset) {
                    // If the offsets do not match, the Server MUST respond with the 409 Conflict status without modifying the upload resource.
                    console.warn(`[PatchHandler] send: Incorrect offset - ${offset} sent but file is ${stats.size}`);
                    return Promise.reject(409);
                }

                return this.store.write(req, file_id, offset);
            })
            .then((new_offset) => {
                //  It MUST include the Upload-Offset header containing the new offset.
                const headers = {
                    'Upload-Offset': new_offset,
                };
                // The Server MUST acknowledge successful PATCH requests with the 204
                return super.send(res, 204, headers);
            })
            .catch((error) => {
                if (Number.isInteger(error)) {
                    return super.send(res, error);
                }

                return super.send(res, 500);
            });
    }
}

module.exports = PatchHandler;
