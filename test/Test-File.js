/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const should = require('should');
const File = require('../lib/models/File');

describe('File', () => {

    describe('constructor', () => {
        it('must be given either a upload_length or upload_defer_length', (done) => {
            assert.throws(() => { new File(); }, Error);
            done();
        });

        it('should generate an the ID for the file', (done) => {
            const file = new File(1);
            file.should.have.property('id');
            assert.equal(typeof file.id, 'string');
            done();
        });

        it('should set properties given', (done) => {
            const upload_length = 1234;
            const upload_defer_length = 1;
            const upload_metadata = 'metadata';
            const file = new File(upload_length, upload_defer_length, upload_metadata);
            assert.equal(file.upload_length, upload_length);
            assert.equal(file.upload_defer_length, upload_defer_length);
            assert.equal(file.upload_metadata, upload_metadata);
            done();
        });
    });
});
