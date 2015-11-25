'use strict';
const assert = require('assert');
const should = require('should');
const DataStore = require('../lib/stores/DataStore');
const File = require('../lib/models/File');

describe('DataStore', () => {
    const datastore = new DataStore({path: '/files'});
    it('should provide extensions', (done) => {
        datastore.should.have.property('extensions');
        assert.equal(datastore.extensions, null);

        datastore.extensions = [ 'creation', 'expiration']
        assert.equal(datastore.extensions, 'creation,expiration');
        done();
    });

    it('must have a create method', (done) => {
        datastore.should.have.property('create');
        datastore.create(new File(1));
        done();
    });

    it('must have a write method', (done) => {
        datastore.should.have.property('write');
        datastore.write();
        done();
    });
    it('must have a getOffset method', (done) => {
        datastore.should.have.property('getOffset');
        datastore.getOffset();
        done();
    });
});
