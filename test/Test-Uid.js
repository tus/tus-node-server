'use strict';
const assert = require('assert');
const Uid = require('../lib/models/Uid');

describe('Uid', () => {
    it('return a 32 char random string', (done) => {
        const id = Uid.rand();
        assert.equal(typeof id, 'string');
        assert.equal(id.length, 32);
        done();
    });
});
