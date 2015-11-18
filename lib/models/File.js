'use strict';
const Uid = require('./Uid');

/**
 * @fileOverview
 * Model for File objects.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class File {
    constructor(entity_length) {
        this.entity_length = entity_length;
        this.id = Uid.rand();
    }

    /**
     * Format headers for the file create API.
     *
     * @param  {string} host
     * @param  {string} url
     * @return {object}
     */
    getHeaders(host, url) {
        return {
            'Location': `http://${host}${url}/${this.id}`,
        };
    }
}

module.exports = File;
