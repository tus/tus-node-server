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

    it('should return a location property', (done) => {
        const file = new File(1);
        const headers = file.getHeaders('tus.io', '/files')
        headers.should.have.property('Location');
        done();
    });
});
