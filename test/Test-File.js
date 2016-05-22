/* eslint-env node, mocha */

'use strict';

const assert = require('assert');
const should = require('should');
const File = require('../lib/models/File');
const Uid = require('../lib/models/Uid');

describe('File', () => {

    describe('constructor', () => {
        it('must require a file_name', () => {
            assert.throws(() => { new File(); }, Error);
        });

        it('must be given either a upload_length or upload_defer_length', () => {
            assert.throws(() => { new File(Uid.rand()); }, Error);
        });

        it('should set properties given', () => {
            const file_id = Uid.rand();
            const upload_length = 1234;
            const upload_defer_length = 1;
            const upload_metadata = 'metadata';
            const file = new File(file_id, upload_length, upload_defer_length, upload_metadata);
            assert.equal(file.id, file_id);
            assert.equal(file.upload_length, upload_length);
            assert.equal(file.upload_defer_length, upload_defer_length);
            assert.equal(file.upload_metadata, upload_metadata);
        });
    });
});
