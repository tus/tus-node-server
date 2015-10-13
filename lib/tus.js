'use strict';

let http = require('http');
let handlers = require('./handlers');

class TusServer {

    constructor() {

    }

    handle(req, res) {
        let method = `${req.method}`.toLowerCase();
        let handler = handlers[method];

        if (!handler) {
            res.writeHead(405, { 'Content-Type': 'text/plain' });
            res.write(`${req.method} Not Allowed`);
            return res.end();
        }

        return handler(req, res);
    }

    listen() {
        let server = http.createServer(this.handle);
        return server.listen.apply(server, arguments);
    }
}

exports = module.exports = TusServer;
