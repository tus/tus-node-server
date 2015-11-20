'use strict';

const BaseHandler = require('./BaseHandler');

class HeadHanlder extends BaseHandler {
    constructor(store) {
        super(store);
    }

    /**
     * Send the uploaded file offset.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        return super.send(res, 501, {}, 'Not Implemented');

        // let offset = this.store.getOffset(req);
        // res.setHeader('Upload-Offset', offset);
        // res.end();
    }
}

module.exports = HeadHanlder;
