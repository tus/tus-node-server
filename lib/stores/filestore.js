'use strict';

let DataStore = require('./datastore');

/**
 * @fileOverview
 * Store using local filesystem.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class FileStore extends DataStore {
    constructor(options) {
        super(options);
    }
}

module.exports = FileStore;
