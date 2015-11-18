'use strict';

const BaseHandler = require('./BaseHandler');

class HeadHanlder extends BaseHandler {
    constructor() {
        super();
    }

    /**
     * Return file range.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        return super.send(res, 501, {}, 'Not Implemented');
    }
}

module.exports = HeadHanlder;
