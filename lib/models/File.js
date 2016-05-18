'use strict';
const Uid = require('./Uid');

/**
 * @fileOverview
 * Model for File objects.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class File {
    constructor(upload_length, upload_defer_length) {
        if (upload_length === undefined && upload_defer_length === undefined) {
            throw new Error('[File] constructor must be given either a upload_length or upload_defer_length')
        }
        this.upload_length = upload_length;
        this.upload_defer_length = upload_defer_length;
        this.id = Uid.rand();
    }
}

module.exports = File;
