/* eslint-env node, mocha */
'use strict';
const assert = require('assert');
const RequestValidator = require('../lib/validators/RequestValidator');
const CONSTANTS = require('../lib/constants');

describe('RequestValidator', () => {
    describe('_invalidUploadOffsetHeader', () => {
        it('should validate a number', (done) => {
            const value = '1234';
            assert.equal(RequestValidator._invalidUploadOffsetHeader(value), false);
            done();
        });

        it('should invalidate a negative number', (done) => {
            const value = '-4';
            assert.equal(RequestValidator._invalidUploadOffsetHeader(value), true);
            done();
        });

        it('should invalidate a non number', (done) => {
            const value = 'hello';
            assert.equal(RequestValidator._invalidUploadOffsetHeader(value), true);
            done();
        });
    });

    describe('_invalidUploadLengthHeader', () => {
        it('should validate a number', (done) => {
            const value = '1234';
            assert.equal(RequestValidator._invalidUploadLengthHeader(value), false);
            done();
        });

        it('should invalidate a number < 1', (done) => {
            assert.equal(RequestValidator._invalidUploadDeferLengthHeader('0'), true);
            assert.equal(RequestValidator._invalidUploadDeferLengthHeader('-1'), true);
            done();
        });

        it('should invalidate a non number', (done) => {
            const value = 'hello';
            assert.equal(RequestValidator._invalidUploadLengthHeader(value), true);
            done();
        });
    });

    describe('_invalidUploadDeferLengthHeader', () => {
        it('should validate 1', (done) => {
            const value = '1';
            assert.equal(RequestValidator._invalidUploadDeferLengthHeader(value), false);
            done();
        });

        it('should invalidate a number !== 1', (done) => {
            assert.equal(RequestValidator._invalidUploadDeferLengthHeader('0'), true);
            assert.equal(RequestValidator._invalidUploadDeferLengthHeader('1234'), true);
            assert.equal(RequestValidator._invalidUploadDeferLengthHeader('-1'), true);
            done();
        });

        it('should invalidate a non number', (done) => {
            const value = 'hello';
            assert.equal(RequestValidator._invalidUploadDeferLengthHeader(value), true);
            done();
        });
    });

    describe('_invalidUploadMetadataHeader', () => {
        it('should validate a comma separated list', (done) => {
            const value = 'hello world, tus rules';
            assert.equal(RequestValidator._invalidUploadMetadataHeader(value), false);
            done();
        });

        it('should validate a singe value', (done) => {
            const value = 'hello world';
            assert.equal(RequestValidator._invalidUploadMetadataHeader(value), false);
            done();
        });

        it('should fail on non comma separated list', (done) => {
            assert.equal(RequestValidator._invalidUploadMetadataHeader('hello'), true);
            assert.equal(RequestValidator._invalidUploadMetadataHeader('hello world, tusrules'), true);
            assert.equal(RequestValidator._invalidUploadMetadataHeader(''), true);
            done();
        });
    });

    describe('_invalidXRequestedWithHeader', () => {
        it('always validate ', (done) => {
            assert.equal(RequestValidator._invalidXRequestedWithHeader(), false);
            done();
        });
    });

    describe('_invalidTusVersionHeader', () => {
        it('should validate tus version', (done) => {
            assert.equal(RequestValidator._invalidTusVersionHeader(CONSTANTS.TUS_RESUMABLE), false);
            done();
        });

        it('should invalidate tus version', (done) => {
            assert.equal(RequestValidator._invalidTusVersionHeader('0.0.0'), true);
            assert.equal(RequestValidator._invalidTusVersionHeader('0.1.0'), true);
            done();
        });
    });

    describe('_invalidTusResumableHeader', () => {
        it('should validate tus version', (done) => {
            assert.equal(RequestValidator._invalidTusResumableHeader(CONSTANTS.TUS_RESUMABLE), false);
            done();
        });

        it('should invalidate tus version', (done) => {
            assert.equal(RequestValidator._invalidTusResumableHeader('0.0.0'), true);
            assert.equal(RequestValidator._invalidTusResumableHeader('0.1.0'), true);
            done();
        });
    });

    describe('_invalidTusExtensionHeader', () => {
        it('always validate ', (done) => {
            assert.equal(RequestValidator._invalidTusExtensionHeader(), false);
            done();
        });
    });


    describe('_invalidTusMaxSizeHeader', () => {
        it('always validate ', (done) => {
            assert.equal(RequestValidator._invalidTusMaxSizeHeader(), false);
            done();
        });
    });

    describe('_invalidXHttpMethodOverrideHeader', () => {
        it('always validate ', (done) => {
            assert.equal(RequestValidator._invalidXHttpMethodOverrideHeader(), false);
            done();
        });
    });

    describe('_invalidAuthorizationHeader', () => {
        it('always validate ', (done) => {
            assert.equal(RequestValidator._invalidAuthorizationHeader(), false);
            done();
        });
    });

    describe('_invalidContentTypeHeader', () => {
        it('should validate octet-stream', (done) => {
            assert.equal(RequestValidator._invalidContentTypeHeader('application/offset+octet-stream'), false);
            done();
        });

        it('should invalidate everything except octet-stream', (done) => {
            assert.equal(RequestValidator._invalidContentTypeHeader('video/mp4'), true);
            assert.equal(RequestValidator._invalidContentTypeHeader('application/json'), true);
            done();
        });
    });

    describe('capitalizeHeader', () => {
        it('should capitalize a header ', (done) => {
            assert.equal(RequestValidator.capitalizeHeader('upload-length'), 'UploadLength');
            done();
        });
    });


    describe('isInvalidHeader', () => {
        it('should invalidate a header ', (done) => {
            assert.equal(RequestValidator.isInvalidHeader('upload-length', '-1'), true);
            done();
        });
    });

});
