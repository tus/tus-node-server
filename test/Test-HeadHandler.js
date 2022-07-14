/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const http = require('http');

const sinon = require('sinon');

const DataStore = require('../lib/stores/DataStore');
const HeadHandler = require('../lib/handlers/HeadHandler');
const { ERRORS } = require('../lib/constants');
const File = require('../lib/models/File');


const hasHeader = (res, header) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};

describe('HeadHandler', () => {
    const path = '/test/output';
    const fake_store = sinon.createStubInstance(DataStore);
    const handler = new HeadHandler(fake_store, { relativeLocation: true, path });
    
    let req = null;
    let res = null;

    beforeEach(() => {
        req = { headers: {}, url: handler.generateUrl({}, '1234') };
        res = new http.ServerResponse({ method: 'HEAD' });
    });

    it('should 404 if no file id match', async () => {
        fake_store.getOffset.rejects(ERRORS.FILE_NOT_FOUND);
        await handler.send(req, res);
        assert.equal(res.statusCode, 404);
    });

    it('should 404 if no file ID ', (done) => {
        req.url = `${path}/`;
        handler.send(req, res);
        assert.equal(res.statusCode, 404);
        done();
    });

    it('should resolve with the offset and cache-control', async () => {
        fake_store.getOffset.resolves({ id: '1234', size: 0, upload_length: 1 });
        await handler.send(req, res);

        assert.equal(hasHeader(res, { 'Upload-Offset': 0 }), true);
        assert.equal(hasHeader(res, { 'Cache-Control': 'no-store' }), true);
        assert.equal(res.statusCode, 200);
    });

    it('should resolve with upload-length', async () => {
        const file = { id: '1234', size: 0, upload_length: '1', upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential' };
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);

        assert.equal(hasHeader(res, { 'Upload-Length': file.upload_length }), true);
        assert.equal(res.hasHeader('Upload-Defer-Length'), false);
    });

    it('should resolve with upload-defer-length', async () => {
        const file = { id: '1234', size: 0, upload_defer_length: '1', upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential' };
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);

        assert.equal(hasHeader(res, { 'Upload-Defer-Length': file.upload_defer_length }), true);
        assert.equal(res.hasHeader('Upload-Length'), false);
    });

    it('should resolve with metadata', async () => {
        const file = { id: '1234', size: 0, upload_length: '1', upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential' };
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);

        assert.equal(hasHeader(res, { 'Upload-Metadata': file.upload_metadata }), true);
    });

    it('should resolve without metadata', async () => {
        const file = { id: '1234', size: 0, upload_length: '1' };
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);

        assert.equal(res.hasHeader('Upload-Metadata'), false);
    });
});
