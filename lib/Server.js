'use strict';

/**
 * @fileOverview
 * TUS Protocol Server Implementation.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */
const http = require('http');
const EventEmitter = require('events');

const DataStore = require('./stores/DataStore');
const HeadHandler = require('./handlers/HeadHandler');
const OptionsHandler = require('./handlers/OptionsHandler');
const PatchHandler = require('./handlers/PatchHandler');
const PostHandler = require('./handlers/PostHandler');
const RequestValidator = require('./validators/RequestValidator');
const EXPOSED_HEADERS = require('./constants').EXPOSED_HEADERS;
const REQUEST_METHODS = require('./constants').REQUEST_METHODS;
const TUS_RESUMABLE = require('./constants').TUS_RESUMABLE;
const debug = require('debug');
const log = debug('tus-node-server');
class TusServer extends EventEmitter {

    constructor() {
        super();

        // Any handlers assigned to this object with the method as the key
        // will be used to repond to those requests. They get set/re-set
        // when a datastore is assigned to the server.
        this.handlers = {};

        // Remove any event listeners from each handler as they are removed
        // from the server. This must come before adding a 'newListener' listener,
        // to not add a 'removeListener' event listener to all request handlers.
        this.on('removeListener', (event, listener) => {
            this.datastore.removeListener(event, listener);
            REQUEST_METHODS.forEach((method) => {
                this.handlers[method].removeListener(event, listener);
            });
        });

        // As event listeners are added to the server, make sure they are
        // bubbled up from request handlers to fire on the server level.
        this.on('newListener', (event, listener) => {
            this.datastore.on(event, listener);
            REQUEST_METHODS.forEach((method) => {
                this.handlers[method].on(event, listener);
            });
        });
    }

    /**
     * Return the data store
     * @return {DataStore}
     */
    get datastore() {
        return this._datastore;
    }

    /**
     * Assign a datastore to this server, and re-set the handlers to use that
     * data store when doing file operations.
     *
     * @param  {DataStore} store Store for uploaded files
     */
    set datastore(store) {
        if (!(store instanceof DataStore)) {
            throw new Error(`${store} is not a DataStore`);
        }

        this._datastore = store;

        this.handlers = {
            // GET handlers should be written in the implementations
            // eg.
            //      const server = new tus.Server();
            //      server.get('/', (req, res) => { ... });
            GET: {},

            // These methods are handled under the tus protocol
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

        // Add this handler callback to the GET method handler list.
        this.handlers.GET[path] = callback;
    }

    /**
     * Main server requestListener, invoked on every 'request' event.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {ServerResponse}
     */
    handle(req, res) {
        log(`[TusServer] handle: ${req.method} ${req.url}`);

        // Allow overriding the HTTP method. The reason for this is
        // that some libraries/environments to not support PATCH and
        // DELETE requests, e.g. Flash in a browser and parts of Java
        if (req.headers['x-http-method-override']) {
            req.method = req.headers['x-http-method-override'].toUpperCase();
        }


        if (req.method === 'GET') {

            // Check if this url has been added to allow GET requests, with an
            // appropriate callback to handle the request
            if (!(req.url in this.handlers.GET)) {
                res.writeHead(404, {});
                res.write('Not found\n');
                return res.end();
            }

            // invoke the callback
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

        // Validate all required headers to adhere to the tus protocol
        const invalid_headers = [];
        for (const header_name in req.headers) {
            if (req.method === 'OPTIONS') {
                continue;
            }

            if (RequestValidator.isInvalidHeader(header_name, req.headers[header_name])) {
                log(`Invalid ${header_name} header: ${req.headers[header_name]}`);
                invalid_headers.push(header_name);
            }
        }

        if (invalid_headers.length > 0) {
            // The request was not configured to the tus protocol
            res.writeHead(412, {}, 'Precondition Failed');
            return res.end(`Invalid ${invalid_headers.join(' ')}\n`);
        }

        // Enable CORS
        res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
        if (req.headers.origin) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        }

        // Invoke the handler for the method requested
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
