'use strict';

/**
 * @fileOverview
 * Generate and random UID.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

const crypto = require('crypto');

class Uid {
    static rand() {
        return crypto.randomBytes(16).toString('hex');
    }
}
module.exports = Uid;
