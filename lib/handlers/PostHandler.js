'use strict';

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
        return this.store.create(req)
            .then((File) => {
                const url = `http://${req.headers.host}${this.store.path}/${File.id}`;
                return super.send(res, 201, { Location: url });
            })
            .catch((error) => {
                if (Number.isInteger(error)) {
                    if (error === 412) {
                        return super.send(res, error, {}, 'Upload-Length or Upload-Defer-Length Required\n');
                    }

                    return super.send(res, error);
                }

                return super.send(res, 500);
            });
    }
}

module.exports = PostHandler;
