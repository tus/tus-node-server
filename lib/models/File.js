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
}

module.exports = File;
