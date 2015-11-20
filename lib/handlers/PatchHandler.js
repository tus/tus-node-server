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

        return super.send(res, 501, {}, 'Not Implemented');

        // let stream = this.store.write(req);

        // let offset = 0;

        // stream.on('data', (data) => {
        //     offset += data.length;
        // });

        // stream.on('end', () => {
        //     super.send(res, 204, {
        //         'Upload-Offset': offset,
        //     });
        // });
    }
}

module.exports = PatchHandler;
