'use strict';

const File = require('../models/File');

/**
 * @fileOverview
 * Based store for all DataStore classes.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class DataStore {
    constructor(options) {
        if (!options.path) {
            throw new Error('Store must have a path');
        }
        this.path = options.path;
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

    create(file) {
        if (!(file instanceof File)) {
            throw new Error('file must adhere to File interface');
        }
        console.log(`[DataStore] create: ${file.id}`);
    }
}

module.exports = DataStore;
