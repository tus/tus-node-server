'use strict';

/**
 * @fileOverview
 * Memory based configstore.
 * Used mostly for unit tests.
 *
 * @author Mitja Puzigaća <mitjap@gmail.com>
 */

class MemoryConfigstore {
    constructor() {
        this.data = new Map();
    }

    async get(key) {
        let value = this.data.get(key);
        if (value !== undefined) {
            value = JSON.parse(value);
        }
        return value;
    }

    async set(key, value) {
        this.data.set(key, JSON.stringify(value));
    }

    async delete(key) {
        return this.data.delete(key);
    }
}

module.exports = MemoryConfigstore;
