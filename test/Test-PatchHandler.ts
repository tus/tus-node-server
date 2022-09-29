import "should";
// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from "assert";
// @ts-expect-error TS(2307): Cannot find module 'http' or its corresponding typ... Remove this comment to see the full error message
import http from "http";
// @ts-expect-error TS(7016): Could not find a declaration file for module 'sino... Remove this comment to see the full error message
import sinon from "sinon";
import PatchHandler from "../lib/handlers/PatchHandler.js";
import DataStore from "../lib/stores/DataStore.js";
const hasHeader = (res: any, header: any) => {
    if (typeof header === 'string') {
        return res._header.indexOf(`${header}:`) > -1;
    }
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('PatchHandler', () => {
    const path = '/test/output';
    let res: any = null;
    let store: any = null;
    let handler: any = null;
    const req = { headers: {} };
    // @ts-expect-error TS(2304): Cannot find name 'beforeEach'.
    beforeEach((done: any) => {
        store = sinon.createStubInstance(DataStore);
        handler = new PatchHandler(store, { path });
        res = new http.ServerResponse({ method: 'PATCH' });
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should 403 if no Content-Type header', () => {
        req.headers = {};
        (req as any).url = `${path}/1234`;
        return assert.rejects(() => handler.send(req, res), { status_code: 403 });
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should 403 if no Upload-Offset header', () => {
        req.headers = { 'content-type': 'application/offset+octet-stream' };
        (req as any).url = `${path}/1234`;
        return assert.rejects(() => handler.send(req, res), { status_code: 403 });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('send()', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 404 urls without a path', () => {
            (req as any).url = `${path}/`;
            return assert.rejects(() => handler.send(req, res), { status_code: 404 });
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 403 if the offset is omitted', () => {
            req.headers = {
                'content-type': 'application/offset+octet-stream',
            };
            (req as any).url = `${path}/file`;
            return assert.rejects(() => handler.send(req, res), { status_code: 403 });
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 403 the content-type is omitted', () => {
            req.headers = {
                'upload-offset': '0',
            };
            (req as any).url = `${path}/file`;
            return assert.rejects(() => handler.send(req, res), { status_code: 403 });
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 400 if upload-defer-length is present when it upload-length is known', () => {
            req.headers = {
                'upload-offset': '0',
                'upload-defer-length': '1',
                'content-type': 'application/offset+octet-stream',
            };
            (req as any).url = `${path}/file`;
            store.getOffset.resolves({ size: 0, upload_length: '512' });
            return assert.rejects(() => handler.send(req, res), { status_code: 400 });
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should declare upload-length once it is send', async () => {
            req.headers = {
                'upload-offset': '0',
                'upload-length': '10',
                'content-type': 'application/offset+octet-stream',
            };
            (req as any).url = `${path}/file`;
            store.getOffset.resolves({ size: 0, upload_defer_length: '1' });
            store.write.resolves(5);
            store.declareUploadLength.resolves();
            await handler.send(req, res);
            assert.equal(store.declareUploadLength.calledOnceWith('file', '10'), true);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 400 if upload-length does not match', () => {
            req.headers = {
                'upload-offset': '0',
                'upload-length': '10',
                'content-type': 'application/offset+octet-stream',
            };
            (req as any).url = `${path}/file`;
            store.getOffset.resolves({ size: 0, upload_length: '20' });
            return assert.rejects(() => handler.send(req, res), { status_code: 400 });
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('must return a promise if the headers validate', () => {
            req.headers = {
                'upload-offset': '0',
                'upload-length': '512',
                'content-type': 'application/offset+octet-stream',
            };
            (req as any).url = `${path}/1234`;
            handler.send(req, res).should.be.a.Promise();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('must 409 if the offset does not match', () => {
            req.headers = {
                'upload-offset': '10',
                'upload-length': '512',
                'content-type': 'application/offset+octet-stream',
            };
            (req as any).url = `${path}/1234`;
            store.getOffset.resolves({ size: 0, upload_length: '512' });
            return assert.rejects(() => handler.send(req, res), { status_code: 409 });
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('must acknowledge successful PATCH requests with the 204', async () => {
            req.headers = {
                'upload-offset': '0',
                'upload-length': '1024',
                'content-type': 'application/offset+octet-stream',
            };
            (req as any).url = `${path}/1234`;
            store.getOffset.resolves({ size: 0, upload_length: '1024' });
            store.write.resolves(10);
            await handler.send(req, res);
            assert.equal(hasHeader(res, { 'Upload-Offset': '10' }), true);
            assert.equal(hasHeader(res, 'Content-Length'), false);
            assert.equal(res.statusCode, 204);
        });
    });
});
