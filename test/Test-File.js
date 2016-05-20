/* eslint-env node, mocha */
/* eslint no-unused-vars: ["error", { "vars": "none" }] */

'use strict';
const assert = require('assert');
const should = require('should');
const File = require('../lib/models/File');
const Uid = require('../lib/models/Uid');

describe('File', () => {
    it('must require a file_name', () => {
        assert.throws(() => {
            const file = new File();
        }, Error);
    });

    it('must require either a upload_length or upload_defer_length', () => {
        assert.throws(() => {
            const file = new File(1);
        }, Error);
    });
});
