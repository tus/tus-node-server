// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from "assert";
// @ts-expect-error TS(2307): Cannot find module 'fs' or its corresponding type ... Remove this comment to see the full error message
import fs from "fs";
// @ts-expect-error TS(2307): Cannot find module 'stream' or its corresponding t... Remove this comment to see the full error message
import stream from "stream";
// @ts-expect-error TS(2307): Cannot find module 'http' or its corresponding typ... Remove this comment to see the full error message
import http from "http";
import should from "should";
// @ts-expect-error TS(7016): Could not find a declaration file for module 'sino... Remove this comment to see the full error message
import sinon from "sinon";
import GetHandler from "../lib/handlers/GetHandler.js";
import DataStore from "../lib/stores/DataStore.js";
import FileStore from "../lib/stores/FileStore.js";
// @ts-expect-error TS(7016): Could not find a declaration file for module 'sino... Remove this comment to see the full error message
import { spy } from "sinon";
const hasHeader = (res: any, header: any) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('GetHandler', () => {
    const path = '/test/output';
    let req: any = null;
    let res: any = null;
    // @ts-expect-error TS(2304): Cannot find name 'beforeEach'.
    beforeEach((done: any) => {
        req = { headers: {}, url: '/' };
        res = new http.ServerResponse({ method: 'GET' });
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('test error responses', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 404 when file does not exist', async () => {
            const store = sinon.createStubInstance(FileStore);
            store.getOffset.rejects({ status_code: 404 });
            const handler = new GetHandler(store, { path });
            const spy_getFileIdFromRequest = sinon.spy(handler, 'getFileIdFromRequest');
            req.url = `${path}/1234`;
            await assert.rejects(() => handler.send(req, res), { status_code: 404 });
            assert.equal(spy_getFileIdFromRequest.calledOnceWith(req), true);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 404 for non registered path', async () => {
            const store = sinon.createStubInstance(FileStore);
            const handler = new GetHandler(store, { path });
            const spy_getFileIdFromRequest = sinon.spy(handler, 'getFileIdFromRequest');
            req.url = `/not_a_valid_file_path`;
            await assert.rejects(() => handler.send(req, res), { status_code: 404 });
            assert.equal(spy_getFileIdFromRequest.callCount, 1);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 404 when file is not complete', async () => {
            const store = sinon.createStubInstance(FileStore);
            store.getOffset.resolves({ size: 512, upload_length: '1024' });
            const handler = new GetHandler(store, { path });
            const fileId = '1234';
            req.url = `${path}/${fileId}`;
            await assert.rejects(() => handler.send(req, res), { status_code: 404 });
            assert.equal(store.getOffset.calledWith(fileId), true);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 500 on error store.getOffset error', () => {
            // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
            const store = new DataStore({ path });
            (store as any).read = () => { };
            const fakeStore = sinon.stub(store);
            fakeStore.getOffset.rejects();
            // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
            const handler = new GetHandler(fakeStore);
            req.url = `${path}/1234`;
            return assert.rejects(() => handler.send(req, res));
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('test invalid stream', async () => {
            const store = sinon.createStubInstance(FileStore);
            const size = 512;
            store.getOffset.resolves({ size, upload_length: size.toString() });
            store.read.returns(stream.Readable.from(fs.createReadStream('invalid_path')));
            const handler = new GetHandler(store, { path });
            const fileId = '1234';
            req.url = `${path}/${fileId}`;
            await handler.send(req, res);
            assert.equal(res.statusCode, 200);
            assert.equal(store.getOffset.calledWith(fileId), true);
            assert.equal(store.read.calledWith(fileId), true);
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('send()', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('test if `file_id` is properly passed to store', async () => {
            const store = sinon.createStubInstance(FileStore);
            store.getOffset.resolves({ size: 512, upload_length: '512' });
            // @ts-expect-error TS(2580): Cannot find name 'Buffer'. Do you need to install ... Remove this comment to see the full error message
            store.read.returns(stream.Readable.from(Buffer.alloc(512)));
            const handler = new GetHandler(store, { path });
            const fileId = '1234';
            req.url = `${path}/${fileId}`;
            await handler.send(req, res);
            assert.equal(store.getOffset.calledWith(fileId), true);
            assert.equal(store.read.calledWith(fileId), true);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('test successful response', async () => {
            const store = sinon.createStubInstance(FileStore);
            const size = 512;
            store.getOffset.resolves({ size, upload_length: size.toString() });
            // @ts-expect-error TS(2580): Cannot find name 'Buffer'. Do you need to install ... Remove this comment to see the full error message
            store.read.returns(stream.Readable.from(Buffer.alloc(size), { objectMode: false }));
            const handler = new GetHandler(store, { path });
            const fileId = '1234';
            req.url = `${path}/${fileId}`;
            await handler.send(req, res);
            assert(res.statusCode, 200);
            assert(hasHeader(res, { 'Content-Length': size }), true);
            assert(store.getOffset.calledOnceWith(fileId), true);
            assert(store.read.calledOnceWith(fileId), true);
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('registerPath()', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should call registered path handler', async () => {
            const fakeStore = sinon.stub(new DataStore());
            // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
            const handler = new GetHandler(fakeStore);
            const customPath1 = `/path1`;
            const pathHandler1 = sinon.spy();
            handler.registerPath(customPath1, pathHandler1);
            const customPath2 = `/path2`;
            const pathHandler2 = sinon.spy();
            handler.registerPath(customPath2, pathHandler2);
            req.url = `${customPath1}`;
            await handler.send(req, res);
            assert.equal(pathHandler1.calledOnceWith(req, res), true);
            assert.equal(pathHandler2.callCount, 0);
            req.url = `${customPath2}`;
            await handler.send(req, res);
            assert.equal(pathHandler1.callCount, 1);
            assert.equal(pathHandler2.calledOnceWith(req, res), true);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should not call DataStore when path matches registered path', async () => {
            const fakeStore = sinon.stub(new DataStore());
            // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
            const handler = new GetHandler(fakeStore);
            const spy_getFileIdFromRequest = sinon.spy(handler, 'getFileIdFromRequest');
            const customPath = `/path`;
            handler.registerPath(customPath, () => { });
            req.url = `${customPath}`;
            await handler.send(req, res);
            assert.equal(spy_getFileIdFromRequest.callCount, 0);
            assert.equal(fakeStore.getOffset.callCount, 0);
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('DataStore without `read` method', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 404 if not implemented', async () => {
            const fakeStore = sinon.stub(new DataStore());
            fakeStore.getOffset.resolves({ size: 512, upload_length: '512' });
            // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
            const handler = new GetHandler(fakeStore);
            req.url = `/${path}/1234`;
            await assert.rejects(() => handler.send(req, res), { status_code: 404 });
        });
    });
});
