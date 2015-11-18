'use strict';

/**
 * @fileOverview
 * TUS Protocol 1.0.0 Server Implementation.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

const http = require('http');
const DataStore = require('./stores/DataStore');
const PostHandler = require('./handlers/PostHandler');
const OptionsHandler = require('./handlers/OptionsHandler');

const TUS_VERSION = '1.0.0';

class Server {

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
            throw new Error('Data store must adhere to DataStore interface');
        }

        this._datastore = store;

        this.handlers = {
            OPTIONS: new OptionsHandler(),
            POST: new PostHandler(store),
            // PATCH: new PatchHandler(),
            // HEAD: new HeadHandler(),
        };
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
        console.info(`${req.method} ${req.url}`);
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
            res.writeHead(204, {});
            res.write('No Content');
            return res.end();
        }

        res.setHeader('Tus-Resumable', TUS_VERSION);

        if (req.headers.origin) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        }

        if (this.handlers[req.method]) {
            return this.handlers[req.method].send(req, res);
        }

        res.writeHead(404, {});
        res.write('Not found');
        return res.end();
    }

    listen() {
        let server = http.createServer(this.handle.bind(this));
        return server.listen.apply(server, arguments);
    }
}

module.exports = Server;
