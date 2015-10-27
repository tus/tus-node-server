'use strict';

/**
 * @fileOverview
 * TUS Protocol 1.0.0 Server Implementation.
 *
 * @author Ben Stahl <bens@vimeo.com>
 */

let http = require('http');
let File = require('./models/file');

class TusServer {

    constructor() {
        this.routes = [];
    }

    /**
     * Add route and controller to the server.
     *
     * @param  {string} url         Path for the route
     * @param  {array} methods      Methods supported
     * @param  {function} handler   Controller function
     */
    route(url, methods, handler) {
        this.routes.push({
            url,
            methods,
            handler,
        });
    }

    /**
     * Wrapper on http.ServerResponse.
     *
     * @param  {ServerResponse} res
     * @param  {integer} status
     * @param  {object} headers
     * @param  {string} body
     * @return {ServerResponse}
     */
    send(res, status, headers, body) {
        body = body ? body : '';
        headers = Object.assign(headers, { 'Content-Length': body.length });
        res.writeHead(status, headers);
        res.write(body);
        return res.end();
    }

    /**
     * Create a new File and return the location.
     *
     * @param  {string} url     Path for the file route
     */
    fileRoute(url) {
        let handler = (req, res) => {
            let length = req.headers['entity-length'];

            // The request MUST include a Entity-Length header
            if (!length) {
                return this.send(res, 400, { 'Content-Type': 'text/plain' }, `Entity-Length Required`);
            }

            length = parseInt(length, 10);
            // The value MUST be a non-negative integer.
            if (isNaN(length) || length < 0) {
                return this.send(res, 400, { 'Content-Type': 'text/plain' }, `Entity-Length must be non-negative`);
            }

            let file = new File(length);
            return this.send(res, 201, file.getHeaders(req.headers.host, url));
        };

        // Clients MUST use a POST
        this.routes.push({
            url,
            methods: ['POST'],
            handler,
        });
    }

    /**
     * Main server requestListener, the function which is
     * automatically added to the 'request' event.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {ServerResponse}
     */
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

        return this.send(res, 404, {}, `Not Found`);
    }

    listen() {
        let server = http.createServer(this.handle.bind(this));
        return server.listen.apply(server, arguments);
    }
}

module.exports = TusServer;
