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
            OPTIONS: new OptionsHandler(store),
            POST: new PostHandler(store),
            HEAD: new HeadHandler(store),
            PATCH: new PatchHandler(store),
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
        console.info(`[TusServer] handle: ${req.method} ${req.url}`);
        // Allow overriding the HTTP method. The reason for this is
        // that some libraries/environments to not support PATCH and
        // DELETE requests, e.g. Flash in a browser and parts of Java
        if (req.headers['x-http-method-override']) {
            req.method = req.headers['x-http-method-override'].toUpperCase();
        }

        // The Tus-Resumable header MUST be included in every request and
        // response except for OPTIONS requests. The value MUST be the version
        // of the protocol used by the Client or the Server.
        res.setHeader('Tus-Resumable', TUS_RESUMABLE);
        if (req.method !== 'OPTIONS' && req.headers['tus-resumable'] !== TUS_RESUMABLE) {
            res.writeHead(412, {}, 'Precondition Failed');
            return res.end();
        }

        if (req.headers.origin) {
            res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        }

        // Handle POST, HEAD, PATCH, OPTIONS requests
        if (this.handlers[req.method]) {
            return this.handlers[req.method].send(req, res);
        }

        // 404 Anything else
        res.writeHead(404, {});
        res.write('Not found');
        return res.end();
    }

    listen() {
        const server = http.createServer(this.handle.bind(this));
        return server.listen.apply(server, arguments);
    }
}

module.exports = TusServer;
