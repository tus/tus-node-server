'use strict';

/**
 * @fileOverview
 * Generate and random UID.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

const crypto = require('crypto');
const crypto_rand = require('crypto-rand');

class Uid {
    static rand() {
        const name = `${new Date().getTime() / crypto_rand.rand()}`;
        return crypto.createHash('md5').update(name).digest('hex');
    }
}
module.exports = Uid;
