/* eslint-env node, mocha */
/* eslint no-unused-vars: ["error", { "vars": "none" }] */

'use strict';
const assert = require('assert');
const should = require('should');
const DataStore = require('../lib/stores/DataStore');
const FileStore = require('../lib/stores/FileStore');
const File = require('../lib/models/File');

describe('FileStore', () => {
    const namingFunction = function(req) { return req.url.replace(/\//g, '-'); };
    const filestore = new FileStore({ path: '/example/files', namingFunction  });
    it('must inherit from Datastore', (done) => {
        assert.equal(filestore instanceof DataStore, true);
        done();
    });

    it('must have a create method', (done) => {
        filestore.should.have.property('create');
        filestore.create();
        done();
    });

    it('must have a write method', (done) => {
        filestore.should.have.property('write');
        filestore.write();
        done();
    });

    it('must have a getOffset method', (done) => {
        filestore.should.have.property('getOffset');
        filestore.getOffset();
        done();
    });

    describe('create()', () => {
        let req = { headers: { 'upload-length': 1000 }, url: '/example/files' };

        it('must return a promise', (done) => {
            assert.equal(filestore.create(req) instanceof Promise, true);
            done();
        });

        it('should return the file name', (done) => {
            filestore.create(req).then((file_id) => {
                assert.equal(file_id, '-example-files');
                done();
            });
        });
    });

    describe('write()', () => {
        it('must return a promise', (done) => {
            assert.equal(filestore.write() instanceof Promise, true);
            done();
        });
    });

    describe('getOffset()', () => {
        it('must return a promise', (done) => {
            assert.equal(filestore.getOffset() instanceof Promise, true);
            done();
        });

        it('must 404 if the file doesnt exist', () => {
            return filestore.getOffset().should.be.rejectedWith(404);
        });
    });
});
