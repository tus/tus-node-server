/* eslint-env node, mocha */
/* eslint no-unused-vars: ["error", { "vars": "none" }] */

'use strict';
const assert = require('assert');
const should = require('should');
const DataStore = require('../lib/stores/DataStore');
const File = require('../lib/models/File');

describe('DataStore', () => {
    const datastore = new DataStore({path: '/test/output'});

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

    it('should check for an extension', (done) => {
        datastore.extensions = [ 'creation', 'expiration'];
        assert.equal(datastore.hasExtension('creation'), true);
        assert.equal(datastore.hasExtension('expiration'), true);

        assert.equal(datastore.hasExtension('concatentation'), false);
        assert.equal(datastore.hasExtension('CREATION'), false); // test case sensitivity
        done();
    });

    it('must have a create method', (done) => {
        datastore.should.have.property('create');
        datastore.create.should.be.type('function');
        done();
    });

    it('must have a remove method', (done) => {
        datastore.should.have.property('remove');
        datastore.remove();
        done();
    });

    it('must have a write method', (done) => {
        datastore.should.have.property('write');
        datastore.write.should.be.type('function');
        done();
    });

    it('must have a getOffset method', (done) => {
        datastore.should.have.property('getOffset');
        datastore.getOffset.should.be.type('function');
        done();
    });
});
