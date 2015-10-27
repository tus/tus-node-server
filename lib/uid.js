'use strict';

/**
 * @fileOverview
 * Generate and random UID.
 *
 * @author Ben Stahl <bens@vimeo.com>
 */

let crypto = require('crypto');
let crypto_rand = require('crypto-rand');

class Uid {
    constructor() {
    }

    static rand() {
        let name = `${new Date().getTime() / crypto_rand.rand()}`;
        return crypto.createHash('md5').update(name).digest('hex');
    }
}
module.exports = Uid;
