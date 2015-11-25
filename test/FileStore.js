'use strict';
const assert = require('assert');
const should = require('should');
const DataStore = require('../lib/stores/DataStore');
const FileStore = require('../lib/stores/FileStore');
const File = require('../lib/models/File');

describe('FileStore', () => {
    const filestore = new FileStore({ path: 'example/files' });
    it('must inherit from Datastore', (done) => {
        assert.equal(filestore instanceof DataStore, true);
        done();
    });

    it('must have a create method', (done) => {
        filestore.should.have.property('create');
        filestore.create(new File(1));
        done();
    });

    it('#create must return a promise', (done) => {
        assert.equal(filestore.create(new File(1)) instanceof Promise, true);
        done();
    });

    it('must have a write method', (done) => {
        filestore.should.have.property('write');
        filestore.write();
        done();
    });

    it('#write must return a promise', (done) => {
        assert.equal(filestore.write() instanceof Promise, true);
        done();
    });

    it('must have a getOffset method', (done) => {
        filestore.should.have.property('getOffset');
        filestore.getOffset();
        done();
    });

    it('#getOffset must return a promise', (done) => {
        assert.equal(filestore.getOffset() instanceof Promise, true);
        done();
    });
});
