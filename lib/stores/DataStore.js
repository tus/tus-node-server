'use strict';

/**
 * @fileOverview
 * Based store for all DataStore classes.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

const Uid = require('../models/Uid');
const File = require('../models/File');
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
        this.path = options.path;
        this.generateFileName = options.namingFunction || Uid.rand;
    }

    get extensions() {
        if (!this._extensions) {
            return null;
        }
        return this._extensions.join();
    }

    set extensions(extensions_array) {
        if (!Array.isArray(extensions_array)) {
            throw new Error('DataStore extensions must be an array');
        }
        this._extensions = extensions_array;
    }

    /**
     * Called in POST requests. This method just creates a
     * file, implementing the creation extension.
     *
     * http://tus.io/protocols/resumable-upload.html#creation
     *
     * @param  {object} req http.incomingMessage
     * @return {Promise}
     */
    create(req) {
        return new Promise((resolve, reject) => {
            const upload_length = req.headers['upload-length'];
            const upload_defer_length = req.headers['upload-defer-length'];
            const upload_metadata = req.headers['upload-metadata'];

            if (upload_length === undefined && upload_defer_length === undefined) {
                return reject(ERRORS.INVALID_LENGTH);
            }

            const file_id = this.generateFileName(req);
            const file = new File(file_id, upload_length, upload_defer_length, upload_metadata);

            this.emit(EVENTS.EVENT_FILE_CREATED, { file });
            return resolve(file);
        });
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
