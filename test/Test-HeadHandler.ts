// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'assert';
// @ts-expect-error TS(2307): Cannot find module 'http' or its corresponding typ... Remove this comment to see the full error message
import http from 'http';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'sino... Remove this comment to see the full error message
import sinon from 'sinon';
import DataStore from '../lib/stores/DataStore.js';
import HeadHandler from '../lib/handlers/HeadHandler.js';
import { ERRORS } from '../lib/constants.js';
const hasHeader = (res: any, header: any) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('HeadHandler', () => {
    const path = '/test/output';
    const fake_store = sinon.createStubInstance(DataStore);
    const handler = new HeadHandler(fake_store, { relativeLocation: true, path });
    let req: any = null;
    let res: any = null;
    // @ts-expect-error TS(2304): Cannot find name 'beforeEach'.
    beforeEach(() => {
        req = { headers: {}, url: handler.generateUrl({}, '1234') };
        res = new http.ServerResponse({ method: 'HEAD' });
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should 404 if no file id match', () => {
        fake_store.getOffset.rejects(ERRORS.FILE_NOT_FOUND);
        return assert.rejects(() => handler.send(req, res), { status_code: 404 });
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should 404 if no file ID', () => {
        req.url = `${path}/`;
        return assert.rejects(() => handler.send(req, res), { status_code: 404 });
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should resolve with the offset and cache-control', async() => {
        fake_store.getOffset.resolves({ id: '1234', size: 0, upload_length: 1 });
        await handler.send(req, res);
        assert.equal(hasHeader(res, { 'Upload-Offset': 0 }), true);
        assert.equal(hasHeader(res, { 'Cache-Control': 'no-store' }), true);
        assert.equal(res.statusCode, 200);
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should resolve with upload-length', async() => {
        const file = { id: '1234', size: 0, upload_length: '1', upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential' };
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);
        assert.equal(hasHeader(res, { 'Upload-Length': file.upload_length }), true);
        assert.equal(res.hasHeader('Upload-Defer-Length'), false);
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should resolve with upload-defer-length', async() => {
        const file = { id: '1234', size: 0, upload_defer_length: '1', upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential' };
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);
        assert.equal(hasHeader(res, { 'Upload-Defer-Length': file.upload_defer_length }), true);
        assert.equal(res.hasHeader('Upload-Length'), false);
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should resolve with metadata', async() => {
        const file = { id: '1234', size: 0, upload_length: '1', upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential' };
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);
        assert.equal(hasHeader(res, { 'Upload-Metadata': file.upload_metadata }), true);
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should resolve without metadata', async() => {
        const file = { id: '1234', size: 0, upload_length: '1' };
        fake_store.getOffset.resolves(file);
        await handler.send(req, res);
        assert.equal(res.hasHeader('Upload-Metadata'), false);
    });
});
