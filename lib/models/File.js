'use strict';
const Uid = require('./Uid');

/**
 * @fileOverview
 * Model for File objects.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class File {
    constructor(upload_length, defer_length) {
        if (upload_length === undefined && defer_length === undefined) {
            throw new Error('[File] constructor must be given either a upload_length or defer_length')
        }
        this.upload_length = upload_length;
        this.defer_length = defer_length;
        this.id = Uid.rand();
    }
}

module.exports = File;
