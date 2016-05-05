'use strict';

const BaseHandler = require('./BaseHandler');

class HeadHandler extends BaseHandler {
    /**
     * Send the uploaded file offset or 404.
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
        return this.store.getOffset(file_name)
            .then((stats) => {
                res.setHeader('Upload-Length', stats.size);
                return res.end();
            })
            .catch((error) => {
                return super.send(res, 404);
            });
    }
}

module.exports = HeadHandler;
