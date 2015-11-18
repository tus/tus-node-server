'use strict';

/**
 * @fileOverview
 * TUS Protocol 1.0.0 Server Implementation.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

const http = require('http');
const DataStore = require('./stores/datastore');
const PostHandler = require('./handlers/posthandler');

const ALLOWED_METHODS = 'POST, HEAD, PATCH, OPTIONS';
const ALLOWED_HEADERS = 'Origin, X-Requested-With, Content-Type, Upload-Length, Upload-Offset, Tus-Resumable, Upload-Metadata';
const EXPOSED_HEADERS = 'Upload-Offset, Location, Upload-Length, Tus-Version, Tus-Resumable, Tus-Max-Size, Tus-Extension, Upload-Metadata';
const MAX_AGE = 86400;
const TUS_VERSION = '1.0.0';

class TusServer {

    constructor() {
        this.routes = [];
    }

    /**
     * Return the data store
     * @return {DataStore}
     */
    get datastore() {
        return this._datastore;
    }

    /**
     * Ensure store is a DataStore and add file create API handler
     *
     * @param  {DataStore} store Store for uploaded files
     */
    set datastore(store) {
        if (!(store instanceof DataStore)) {
            throw new Error('Data store must adhere to DataStore interface');
        }

        this._datastore = store;
        this.FILE_PATH_REGEX = new RegExp(`\\${store.path}\\/(\\w+)\/?`);
        this._datastore_path = store.path;

        // Clients MUST use a POST
        this.routes.push({
            url: store.path,
            methods: ['POST'],
            handler: new PostHandler(store),
        });
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
     * Handle PATCH requests to file routes.
     *
     * @param  {string} url     Path for the file route
     */

    upload(req, res) {
        const ID = req.url.match(this.FILE_PATH_REGEX)[1];

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
        console.info(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
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

        if (req.headers.origin) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
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
        if (this.FILE_PATH_REGEX.test(req.url)) {
            return this.upload(req, res);
        }

        // Test implementor added any custom routes
        let app_route = this.routes.find((route) => {
            if (route.url !== req.url) {
                return false;
            }

            if (!route.methods.some(method => method === req.method)) {
                return false;
            }

            return true;
        });

        // Handle custom route
        if (app_route) {
            return app_route.handler.send(req, res);
        }

        return this.send(res, 404, {}, `Not Found`);
    }

    listen() {
        let server = http.createServer(this.handle.bind(this));
        return server.listen.apply(server, arguments);
    }
}

module.exports = TusServer;
