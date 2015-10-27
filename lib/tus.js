'use strict';

/**
 * @fileOverview
 * TUS Protocol 1.0.0 Server Implementation.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

let http = require('http');
let File = require('./models/file');

const ALLOWED_METHODS = 'POST, HEAD, PATCH, OPTIONS';
const ALLOWED_HEADERS = 'Origin, X-Requested-With, Content-Type, Upload-Length, Upload-Offset, Tus-Resumable, Upload-Metadata';
const EXPOSED_HEADERS = 'Upload-Offset, Location, Upload-Length, Tus-Version, Tus-Resumable, Tus-Max-Size, Tus-Extension, Upload-Metadata';
const MAX_AGE = 86400;
const TUS_VERSION = '1.0.0'

class TusServer {

    constructor() {
        this.routes = [];
        this._file_prefix = '/files';
        this.FILE_ROUTE_REGEX = new RegExp('\\' + this._file_prefix + '\\/(\\w+)\/?');
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
        headers = Object.assign(headers, {
            'Content-Length': body.length,
        });
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
        this._file_prefix = url;
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
     * Handle PATCH requests to file routes.
     *
     * @param  {string} url     Path for the file route
     */

    upload(req, res) {
        const ID = req.url.match(this.FILE_ROUTE_REGEX)[1];

        if (req.method === 'HEAD') {
            return this.send(res, 200, {}, ID);
        }

        if (req.method === 'PATCH') {
            return this.send(res, 200, {}, ID);
        }

        return this.send(res, 404, {}, `Not Found`);
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
        // Allow overriding the HTTP method. The reason for this is
        // that some libraries/environments to not support PATCH and
        // DELETE requests, e.g. Flash in a browser and parts of Java
        if (req.headers['x-http-method-override']) {
            req.method = req.headers['x-http-method-override'].toUpperCase();
        }

        // Test if the version sent by the client is supported
        // GET methods are not checked since a browser may visit this URL and does
        // not include this header. This request is not part of the specification.
        if (req.method !== 'GET' && req.headers['tus-resumable'] !== TUS_VERSION) {
            return this.send(res, 204, {}, `No Content`);
        }

        res.setHeader('Tus-Resumable', TUS_VERSION);

        if (req.headers['origin']) {
            res.setHeader('Access-Control-Allow-Origin', req.headers['origin']);
        }

        if (req.method === 'OPTIONS') {
            // Preflight request
            res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
            res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
            res.setHeader('Access-Control-Max-Age', MAX_AGE);
        } else {
            // Actual request
            res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
        }

        // Test if request is to a file route
        if (this.FILE_ROUTE_REGEX.test(req.url)) {
            return this.upload(req, res);
        }

        // Test implementor added any custom routes
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

        // Handle custom route
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
