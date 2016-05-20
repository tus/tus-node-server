'use strict';

/**
 * @fileOverview
 * Based store for all DataStore classes.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

const Uid = require('../models/Uid');

class DataStore {
    constructor(options) {
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
        console.log('[DataStore] create');

        return new Promise((resolve, reject) => {
            if (req.headers['upload-length'] === undefined && req.headers['upload-defer-length'] === undefined) {
                reject(412);
            }

            const file_name = this.generateFileName(req);
            resolve(file_name);
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
        console.log('[DataStore] write');
        return new Promise((resolve, reject) => {
            // Stub resolve for tests
            const offset = 0;
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
                return reject(404);
            }
            return resolve({ size: 0, upload_length: 1 });
        });
    }
}

module.exports = DataStore;
