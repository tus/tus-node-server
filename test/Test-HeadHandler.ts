import assert from 'node:assert/strict';
import http from 'http';
import sinon from 'sinon';
import DataStore from '../lib/stores/DataStore';
import HeadHandler from '../lib/handlers/HeadHandler';
import { ERRORS } from '../lib/constants';
const hasHeader = (res: any, header: any) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};

describe('HeadHandler', () => {
    const path = '/test/output';
    const fake_store = sinon.createStubInstance(DataStore);
    const handler = new HeadHandler(fake_store, { relativeLocation: true, path });
    let req: { url: string, headers: Record<string, string> } = { headers: {}, url: '' };
    // @ts-expect-error
    let res: http.ServerResponse<http.IncomingMessage> = new http.ServerResponse({ method: 'HEAD' });

    beforeEach(() => {
        req = { headers: {}, url: handler.generateUrl({}, '1234') };
    // @ts-expect-error
        res = new http.ServerResponse({ method: 'HEAD' });
    });

    it('should 404 if no file id match', () => {
        fake_store.getOffset.rejects(ERRORS.FILE_NOT_FOUND);
        return assert.rejects(() => handler.send(req, res), { status_code: 404 });
    });

    it('should 404 if no file ID', () => {
        req.url = `${path}/`;
        return assert.rejects(() => handler.send(req, res), { status_code: 404 });
    });

    it('should resolve with the offset and cache-control', async() => {
    // @ts-expect-error
        fake_store.getOffset.resolves({ id: '1234', size: 0, upload_length: 1 });
        await handler.send(req, res);
        assert.equal(hasHeader(res, { 'Upload-Offset': 0 }), true);
        assert.equal(hasHeader(res, { 'Cache-Control': 'no-store' }), true);
        assert.equal(res.statusCode, 200);
    });

    it('should resolve with upload-length', async() => {
        const file = { id: '1234', size: 0, upload_length: '1', upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential' };
    // @ts-expect-error
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);
        assert.equal(hasHeader(res, { 'Upload-Length': file.upload_length }), true);
        assert.equal(res.hasHeader('Upload-Defer-Length'), false);
    });

    it('should resolve with upload-defer-length', async() => {
        const file = { id: '1234', size: 0, upload_defer_length: '1', upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential' };
    // @ts-expect-error
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);
        assert.equal(hasHeader(res, { 'Upload-Defer-Length': file.upload_defer_length }), true);
        assert.equal(res.hasHeader('Upload-Length'), false);
    });

    it('should resolve with metadata', async() => {
        const file = { id: '1234', size: 0, upload_length: '1', upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential' };
    // @ts-expect-error
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);
        assert.equal(hasHeader(res, { 'Upload-Metadata': file.upload_metadata }), true);
    });

    it('should resolve without metadata', async() => {
        const file = { id: '1234', size: 0, upload_length: '1' };
    // @ts-expect-error
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);
        assert.equal(res.hasHeader('Upload-Metadata'), false);
    });
});
