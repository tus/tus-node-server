'use strict';

/**
 * @fileOverview
 * TUS Protocol 1.0.0 Server Implementation.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

const http = require('http');
const DataStore = require('./stores/DataStore');

const OptionsHandler = require('./handlers/OptionsHandler');
const PostHandler = require('./handlers/PostHandler');
const HeadHandler = require('./handlers/HeadHandler');
const PatchHandler = require('./handlers/PatchHandler');
const TUS_RESUMABLE = require('./constants').TUS_RESUMABLE;
const RequestValidator = require('./validators/RequestValidator');
const EXPOSED_HEADERS = require('./constants').EXPOSED_HEADERS;

class TusServer {

    constructor() {
        this.handlers = {};
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
            throw new Error(`${store} is not a DataStore`);
        }

        this._datastore = store;

        this.handlers = {
            GET: {}, // Alow implemenation to have full handler control
            HEAD: new HeadHandler(store),
            OPTIONS: new OptionsHandler(store),
            PATCH: new PatchHandler(store),
            POST: new PostHandler(store),
        };
    }


    /**
     * Allow the implementation to handle GET requests, in an
     * express.js style manor.
     *
     * @param  {String}   path     Path for the GET request
     * @param  {Function} callback Request listener
     */
    get(path, callback) {
        this.handlers.GET[path] = callback;
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
        console.info(`[TusServer] handle: ${req.method} ${req.url}`);
        // Allow overriding the HTTP method. The reason for this is
        // that some libraries/environments to not support PATCH and
        // DELETE requests, e.g. Flash in a browser and parts of Java
        if (req.headers['x-http-method-override']) {
            req.method = req.headers['x-http-method-override'].toUpperCase();
        }

        if (req.method === 'GET') {
            if (!(req.url in this.handlers.GET)) {
                res.writeHead(404, {});
                res.write('Not found\n');
                return res.end();
            }
            return this.handlers.GET[req.url](req, res);
        }

        // The Tus-Resumable header MUST be included in every request and
        // response except for OPTIONS requests. The value MUST be the version
        // of the protocol used by the Client or the Server.
        res.setHeader('Tus-Resumable', TUS_RESUMABLE);
        if (req.method !== 'OPTIONS' && req.headers['tus-resumable'] === undefined) {
            res.writeHead(412, {}, 'Precondition Failed');
            return res.end('Tus-Resumable Required\n');
        }

        // Validate all other headers
        const invalid_headers = [];
        for (const header_name in req.headers) {
            if (req.method === 'OPTIONS') {
                continue;
            }

            if (RequestValidator.isInvalidHeader(header_name, req.headers[header_name])) {
                console.warn(`Invalid ${header_name} header: ${req.headers[header_name]}`);
                invalid_headers.push(header_name);
            }
        }

        if (invalid_headers.length > 0) {
            res.writeHead(412, {}, 'Precondition Failed');
            return res.end(`Invalid ${invalid_headers.join(' ')}\n`);
        }

        if (req.headers.origin) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        }

        res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);

        // Handle POST, HEAD, PATCH, OPTIONS requests
        if (this.handlers[req.method]) {
            return this.handlers[req.method].send(req, res);
        }

        // 404 Anything else
        res.writeHead(404, {});
        res.write('Not found\n');
        return res.end();
    }

    listen() {
        const server = http.createServer(this.handle.bind(this));
        return server.listen.apply(server, arguments);
    }
}

module.exports = TusServer;
