'use strict';

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
}

module.exports = DataStore;
