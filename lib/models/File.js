'use strict';
const Uid = require('./Uid');

/**
 * @fileOverview
 * Model for File objects.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class File {
    constructor(upload_length) {
        this.upload_length = upload_length;
        this.id = Uid.rand();
    }
}

module.exports = File;
