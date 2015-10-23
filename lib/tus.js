'use strict';

let http = require('http');
let default_handlers = require('./handlers');

class TusServer {

    constructor() {
        this.routes = [];
    }

    route(url, methods, handler) {
        this.routes.push({
            url,
            methods,
            handler,
        });
    }

    handle(req, res) {
        let app_route = this.routes.find((route) => {
            if (route.url !== req.url) {
                return false;
            }
            let supported_method = route.methods.some(method => method === req.method);
            if (!supported_method) {
                return false;
            }

            return true;
        });

        if (app_route) {
            return app_route.handler(req, res);
        }

        let default_handler = default_handlers[`${req.method}`.toLowerCase()];
        if (default_handler) {
            default_handler(req, res);
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.write('Not Found');
        return res.end();
    }

    listen() {
        let server = http.createServer(this.handle.bind(this));
        return server.listen.apply(server, arguments);
    }
}

exports = module.exports = TusServer;
