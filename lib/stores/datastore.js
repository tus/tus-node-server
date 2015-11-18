'use strict';

const File = require('../models/file');

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

    create(file) {
        if (!(file instanceof File)) {
            throw new Error('file must adhere to File interface');
        }
        console.log(`[DataStore] create: ${file.id}`);
    }
}

module.exports = DataStore;
