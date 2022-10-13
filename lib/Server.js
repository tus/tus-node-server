'use strict';

/**
 * @fileOverview
 * TUS Protocol Server Implementation.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */
const http = require('http');
const EventEmitter = require('events');

const GetHandler = require('./handlers/GetHandler');
const HeadHandler = require('./handlers/HeadHandler');
const OptionsHandler = require('./handlers/OptionsHandler');
const PatchHandler = require('./handlers/PatchHandler');
const PostHandler = require('./handlers/PostHandler');
const DeleteHandler = require('./handlers/DeleteHandler');
const RequestValidator = require('./validators/RequestValidator');
const { ERRORS, EXPOSED_HEADERS, REQUEST_METHODS, TUS_RESUMABLE } = require('./constants');
const debug = require('debug');
const log = debug('tus-node-server');
class TusServer extends EventEmitter {

    constructor(options) {
        super();

        if (!options) {
            throw new Error('\'options\' must be defined');
        }
        if (!options.path) {
            throw new Error('\'path\' is not defined; must have a path');
        }

        this.options = { ...options };


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
        this._datastore = store;

        this.handlers = {
            // GET handlers should be written in the implementations
            // eg.
            //      const server = new tus.Server();
            //      server.get('/', (req, res) => { ... });
            GET: new GetHandler(store, this.options),

            // These methods are handled under the tus protocol
            HEAD: new HeadHandler(store, this.options),
            OPTIONS: new OptionsHandler(store, this.options),
            PATCH: new PatchHandler(store, this.options),
            POST: new PostHandler(store, this.options),
            DELETE: new DeleteHandler(store, this.options),
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
        this.handlers.GET.registerPath(path, callback);
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
            const handler = this.handlers.GET;
            return handler.send(req, res)
                .catch((error) => {
                    log(`[${handler.constructor.name}]`, error);
                    const status_code = error.status_code || ERRORS.UNKNOWN_ERROR.status_code;
                    const body = error.body || `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`;
                    return handler.write(res, status_code, {}, body);
                });
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

            // Content type is only checked for PATCH requests. For all other
            // request methods it will be ignored and treated as no content type
            // was set because some HTTP clients may enforce a default value for
            // this header.
            // See https://github.com/tus/tus-node-server/pull/116
            if (header_name.toLowerCase() === 'content-type' && req.method !== 'PATCH') {
                continue;
            }
            if (RequestValidator.isInvalidHeader(header_name, req.headers[header_name])) {
                log(`Invalid ${header_name} header: ${req.headers[header_name]}`);
                invalid_headers.push(header_name);
            }
        }

        if (invalid_headers.length > 0) {
            // The request was not configured to the tus protocol
            res.writeHead(400, {}, 'Bad Request');
            return res.end(`Invalid ${invalid_headers.join(' ')}\n`);
        }

        // Enable CORS
        res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
        if (req.headers.origin) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        }

        // Invoke the handler for the method requested
        const handler = this.handlers[req.method];
        if (handler) {
            return handler.send(req, res)
                .catch((error) => {
                    log(`[${handler.constructor.name}]`, error);
                    const status_code = error.status_code || ERRORS.UNKNOWN_ERROR.status_code;
                    const body = error.body || `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`;
                    return handler.write(res, status_code, {}, body);
                });
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
