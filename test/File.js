'use strict';
const assert = require('assert');
const should = require('should');
const File = require('../lib/models/File');
const Uid = require('../lib/models/Uid');

describe('File', () => {
    it('should have an ID', (done) => {
        const file = new File(1);
        file.should.have.property('id');
        assert.equal(typeof file.id, 'string');
        done();
    });
});
