'use strict';

/**
 * @fileOverview
 * Based store for all DataStore classes.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

const EventEmitter = require('events');
class DataStore extends EventEmitter {

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

    hasExtension(extension) {
        return this._extensions && this._extensions.indexOf(extension) !== -1;
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
     * @param {string} file_id Name of the file
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
     * @param {object} stream stream.Readable
     * @param {string} file_id Name of file
     * @param {integer} offset starting offset
     * @return {Promise}
     */
    write(stream, file_id, offset) {
        return Promise.resolve(0);
    }

    /**
     * Called in HEAD requests. This method should return the bytes
     * writen to the DataStore, for the client to know where to resume
     * the upload.
     *
     * @param {string} file_id Name of file
     * @return {Promise} bytes written
     */
    getOffset(file_id) {
        return Promise.resolve({ size: 0, upload_length: 0 });
    }
}

module.exports = DataStore;
