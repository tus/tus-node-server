'use strict';

/**
 * @fileOverview
 * Based store for all DataStore classes.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

const Uid = require('../models/Uid');
const EventEmitter = require('events');
const ERRORS = require('../constants').ERRORS;
const EVENTS = require('../constants').EVENTS;
const debug = require('debug');
const log = debug('tus-node-server:stores');
class DataStore extends EventEmitter {
    constructor(options) {
        super();
        if (!options || !options.path) {
            throw new Error('Store must have a path');
        }
        if (options.namingFunction && typeof options.namingFunction !== 'function') {
            throw new Error('namingFunction must be a function');
        }
        this._path = options.path;
        this._namingFunction = options.namingFunction || Uid.rand;
        this._relativeLocation = options.relativeLocation || false;
    }

    get path() {
        return this._path;
    }

    get extensions() {
        if (!this._extensions) {
            return null;
        }
        return this._extensions.join();
    }

    get relativeLocation() {
        return this._relativeLocation;
    }

    set extensions(extensions_array) {
        if (!Array.isArray(extensions_array)) {
            throw new Error('DataStore extensions must be an array');
        }
        this._extensions = extensions_array;
    }

    hasExtension(extension) {
        return this._extensions && this._extensions.indexOf(extension) !== -1;
    }

    generateFileName(req) {
        return this._namingFunction(req);
    }

    /**
     * Called in POST requests. This method just creates a
     * file, implementing the creation extension.
     *
     * http://tus.io/protocols/resumable-upload.html#creation
     *
     * @param  {File} file
     * @return {Promise} offset
     */
    create(file) {
        return Promise.resolve(file);
    }

    /**
     * Called in DELETE requests. This method just deletes the file from the store.
     * http://tus.io/protocols/resumable-upload.html#termination
     *
     * @param  {object} req http.incomingMessage
     * @return {Promise}
     */
    remove(file_id) {
        return Promise.resolve();
    }


    /**
     * Called in PATCH requests. This method should write data
     * to the DataStore file, and possibly implement the
     * concatenation extension.
     *
     * http://tus.io/protocols/resumable-upload.html#concatenation
     *
     * @param  {object} req http.incomingMessage
     * @return {Promise}
     */
    write(req) {
        log('[DataStore] write');
        return new Promise((resolve, reject) => {
            // Stub resolve for tests
            const offset = 0;

            this.emit(EVENTS.EVENT_UPLOAD_COMPLETE, { file: null });
            return resolve(offset);
        });
    }

    /**
     * Called in HEAD requests. This method should return the bytes
     * writen to the DataStore, for the client to know where to resume
     * the upload.
     *
     * @param  {string} id     filename
     * @return {Promise}       bytes written
     */
    getOffset(id) {
        return new Promise((resolve, reject) => {
            if (!id) {
                return reject(ERRORS.FILE_NOT_FOUND);
            }

            return resolve({ size: 0, upload_length: 1 });
        });
    }
}

module.exports = DataStore;
