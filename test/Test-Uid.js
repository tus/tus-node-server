'use strict';
const assert = require('assert');
const Uid = require('../lib/models/Uid');

describe('Uid', () => {
    it('returns a 32 char string', (done) => {
        const id = Uid.rand();
        assert.equal(typeof id, 'string');
        assert.equal(id.length, 32);
        done();
    });
    it('returns a different string every time', (done) => {
        let ids = {};
        for(let i = 0; i < 16; i++) {
            const id = Uid.rand();
            assert(!ids[id], 'id was encountered multiple times');
            ids[id] = true;
        }
        done();
    });
});
