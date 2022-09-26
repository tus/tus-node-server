/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const http = require('http');
const sinon = require('sinon')
const should = require('should')
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
    const store = new DataStore();
    const handler = new PatchHandler(store, { path });
    const req = { headers: {} };

    beforeEach((done) => {
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
                'upload-offset': 0,
            };
            req.url = `${path}/file`;
            return assert.rejects(() => handler.send(req, res), { status_code: 403 });
        });

        it('must return a promise if the headers validate', () => {
            req.headers = {
                'upload-offset': 0,
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;
            handler.send(req, res).should.be.a.Promise();
        });

        it('must 409 if the offset does not match', () => {
            req.headers = {
                'upload-offset': 10,
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;

            return assert.rejects(() => handler.send(req, res), { status_code: 409 });
        });

        it('must acknowledge successful PATCH requests with the 204', async () => {
            req.headers = {
                'upload-offset': 0,
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;
            const fake = sinon.fake()
            handler.emit = fake

            await handler.send(req, res)

            assert.equal(hasHeader(res, { 'Upload-Offset': 0 }), true);
            assert.equal(hasHeader(res, 'Content-Length'), false);
            assert.equal(res.statusCode, 204);
            assert.equal(fake.calledOnce, true)
        });
    });
});
