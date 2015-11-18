'use strict';

const BaseHandler = require('./BaseHandler');

class PatchHandler extends BaseHandler {
    constructor() {
        super();
    }

    /**
     * Upload file.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    send(req, res) {
        return super.send(res, 501, {}, 'Not Implemented');
    }
}

module.exports = PatchHandler;
