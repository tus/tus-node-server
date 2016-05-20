/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const http = require('http');
const should = require('should');
const PatchHandler = require('../lib/handlers/PatchHandler');
const DataStore = require('../lib/stores/DataStore');

const hasHeader = (res, header) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};

describe('PatchHandler', () => {
    const path = '/files';
    let res = null;
    const store = new DataStore({ path });
    const handler = new PatchHandler(store);
    const req = { headers: {} };

    beforeEach((done) => {
        res = new http.ServerResponse({ method: 'PATCH' });
        done();
    });

    it('should 403 if no Content-Type header', (done) => {
        req.headers = {};
        req.url = `${path}/1234`;
        handler.send(req, res);
        assert.equal(res.statusCode, 403);
        done();
    });

    it('should 403 if no Upload-Offset header', (done) => {
        req.headers = { 'content-type': 'application/offset+octet-stream' };
        req.url = `${path}/1234`;
        handler.send(req, res);
        assert.equal(res.statusCode, 403);
        done();
    });

    describe('send()', () => {

        it('should 404 urls without a path', () => {
            req.url = `${path}/`;
            handler.send(req, res);
            assert.equal(res.statusCode, 404);
        });

        it('should 403 if the offset is omitted', () => {
            req.headers = {
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/file`;
            handler.send(req, res);
            assert.equal(res.statusCode, 403);
        });

        it('should 403 the content-type is omitted', () => {
            req.headers = {
                'upload-offset': 0,
            };
            req.url = `${path}/file`;
            handler.send(req, res);
            assert.equal(res.statusCode, 403);
        });

        it('must return a promise if the headers validate', () => {
            req.headers = {
                'upload-offset': 0,
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;
            return handler.send(req, res).should.be.a.Promise();
        });

        it('must 409 if the offset does not match', (done) => {
            req.headers = {
                'upload-offset': 10,
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;

            return handler.send(req, res)
                .then(() => {
                    assert.equal(res.statusCode, 409);
                    return;
                })
                .then(done)
                .catch(done);
        });

        it('must acknowledge successful PATCH requests with the 204', (done) => {
            req.headers = {
                'upload-offset': 0,
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;

            return handler.send(req, res)
                .then(() => {
                    assert.equal(hasHeader(res, { 'Upload-Offset': 0 }), true);
                    assert.equal(res.statusCode, 204);
                    return;
                })
                .then(done)
                .catch(done);
        });
    });

});
