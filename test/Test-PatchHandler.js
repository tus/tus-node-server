/* eslint-env node, mocha */
'use strict';

require('should');
const assert = require('assert');
const http = require('http');
const sinon = require('sinon');
const PatchHandler = require('../lib/handlers/PatchHandler');
const DataStore = require('../lib/stores/DataStore');

const hasHeader = (res, header) => {
    if (typeof header === 'string') {
        return res._header.indexOf(`${header}:`) > -1;
    }
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};

describe('PatchHandler', () => {
    const path = '/test/output';
    let res = null;
    let store = null;
    let handler = null;
    const req = { headers: {} };

    beforeEach((done) => {
        store = sinon.createStubInstance(DataStore);

        handler = new PatchHandler(store, { path });
        res = new http.ServerResponse({ method: 'PATCH' });
        done();
    });

    it('should 403 if no Content-Type header', () => {
        req.headers = {};
        req.url = `${path}/1234`;
        return assert.rejects(() => handler.send(req, res), { status_code: 403 });
    });

    it('should 403 if no Upload-Offset header', () => {
        req.headers = { 'content-type': 'application/offset+octet-stream' };
        req.url = `${path}/1234`;
        return assert.rejects(() => handler.send(req, res), { status_code: 403 });
    });

    describe('send()', () => {
        it('should 404 urls without a path', () => {
            req.url = `${path}/`;
            return assert.rejects(() => handler.send(req, res), { status_code: 404 });
        });

        it('should 403 if the offset is omitted', () => {
            req.headers = {
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/file`;
            return assert.rejects(() => handler.send(req, res), { status_code: 403 });
        });

        it('should 403 the content-type is omitted', () => {
            req.headers = {
                'upload-offset': '0',
            };
            req.url = `${path}/file`;
            return assert.rejects(() => handler.send(req, res), { status_code: 403 });
        });

        it('should 400 if upload-defer-length is present when it upload-length is known', () => {
            req.headers = {
                'upload-offset': '0',
                'upload-defer-length': '1',
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/file`;

            store.getOffset.resolves({ size: 0, upload_length: '512' });

            return assert.rejects(() => handler.send(req, res), { status_code: 400 });
        });

        it('should declare upload-length once it is send', async () => {
            req.headers = {
                'upload-offset': '0',
                'upload-length': '10',
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/file`;

            store.getOffset.resolves({ size: 0, upload_defer_length: '1' });
            store.write.resolves(5);
            store.declareUploadLength.resolves();

            await handler.send(req, res);

            assert.equal(store.declareUploadLength.calledOnceWith('file', '10'), true);
        });
        
        it('should 400 if upload-length does not match', () => {
            req.headers = {
                'upload-offset': '0',
                'upload-length': '10',
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/file`;

            store.getOffset.resolves({ size: 0, upload_length: '20' });

            return assert.rejects(() => handler.send(req, res), { status_code: 400 });
        });

        it('must return a promise if the headers validate', () => {
            req.headers = {
                'upload-offset': '0',
                'upload-length': '512',
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;
            handler.send(req, res).should.be.a.Promise();
        });

        it('must 409 if the offset does not match', () => {
            req.headers = {
                'upload-offset': '10',
                'upload-length': '512',
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;

            store.getOffset.resolves({ size: 0, upload_length: '512' });

            return assert.rejects(() => handler.send(req, res), { status_code: 409 });
        });

        it('must acknowledge successful PATCH requests with the 204', async () => {
            req.headers = {
                'upload-offset': '0',
                'upload-length': '1024',
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;

            store.getOffset.resolves({ size: 0, upload_length: '1024' });
            store.write.resolves(10);

            await handler.send(req, res)

            assert.equal(hasHeader(res, { 'Upload-Offset': '10' }), true);
            assert.equal(hasHeader(res, 'Content-Length'), false);
            assert.equal(res.statusCode, 204);
        });
    });
});
