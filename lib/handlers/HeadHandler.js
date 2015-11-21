'use strict';

const BaseHandler = require('./BaseHandler');

class HeadHanlder extends BaseHandler {
    constructor(store) {
        super(store);
    }

    /**
     * Send the uploaded file offset or 404.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        const re = new RegExp('\\' + this.store.path + '\\/(\\w+)\/?');
        const file_name = req.url.match(re);
        if (!file_name) {
            return super.send(res, 404);
        }

        this.store.getOffset(file_name)
            .then(stats => {
                res.setHeader('Upload-Offset', stats.size);
                res.end();
            })
            .catch(error => {
                super.send(res, 404);
            });
    }
}

module.exports = HeadHanlder;
