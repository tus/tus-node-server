/* eslint-env node, mocha */
/* eslint no-unused-vars: ["error", { "vars": "none" }] */

'use strict';
const assert = require('assert');
const should = require('should');
const DataStore = require('../lib/stores/DataStore');
const File = require('../lib/models/File');

describe('DataStore', () => {
    const datastore = new DataStore({path: '/files'});

    it('constructor must require a path', (done) => {
        assert.throws(() => { new DataStore() }, Error);
        done();
    });

    it('constructor must require the namingFunction to be a function, if it is provided', (done) => {
        assert.throws(() => { new DataStore({ path: '/files', namingFunction: {} }) }, Error);
        done();
    });

    it('relativeLocation option must be boolean', (done) => {
        assert.equal(typeof datastore.relativeLocation, 'boolean');
        done();
    });

    it('should provide extensions', (done) => {
        datastore.should.have.property('extensions');
        assert.equal(datastore.extensions, null);

        datastore.extensions = [ 'creation', 'expiration'];
        assert.equal(datastore.extensions, 'creation,expiration');
        done();
    });

    it('extensions must be an array', (done) => {
        assert.throws(() => {
            datastore.extensions = 'creation, expiration';
        }, Error);
        done();
    });

    it('must have a create method', () => {
        datastore.should.have.property('create');
        const req = {
            headers: {
                'upload-length': 42,
                'upload-defer-length': 0,
                'upload-metadata': 'type YXBwbGljYXRpb24vcGRm,name bXktZmlsZS5wZGY=,filetype YXBwbGljYXRpb24vcGRm,filename bXktZmlsZS5wZGY='
            }
        };
        return datastore.create(req);
    });

    it('must have a write method', (done) => {
        datastore.should.have.property('write');
        datastore.write();
        done();
    });

    it('must have a getOffset method', () => {
        datastore.should.have.property('getOffset');
        const id = 42;
        return datastore.getOffset(id);
    });

    it('must have a _parseMetadataString method', (done) => {
        datastore.should.have.property('_parseMetadataString');
        const uploadMetadata = 'type YXBwbGljYXRpb24vcGRm,name bXktZmlsZS5wZGY=,filetype YXBwbGljYXRpb24vcGRm,filename bXktZmlsZS5wZGY='
        let parsed = datastore._parseMetadataString(uploadMetadata);
        parsed.should.deepEqual({
            "filename": {
                "decoded": "my-file.pdf",
                "encoded": "bXktZmlsZS5wZGY="
            },
            "filetype": {
                "decoded": "application/pdf",
                "encoded": "YXBwbGljYXRpb24vcGRm"
            },
            "name": {
                "decoded": "my-file.pdf",
                "encoded": "bXktZmlsZS5wZGY="
            },
            "type": {
                "decoded": "application/pdf",
                "encoded": "YXBwbGljYXRpb24vcGRm"
            }
        })
        parsed = datastore._parseMetadataString(null);
        parsed.should.deepEqual({})
        done();
    });
});
