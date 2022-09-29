// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from "assert";
// @ts-expect-error TS(2307): Cannot find module 'http' or its corresponding typ... Remove this comment to see the full error message
import http from "http";
import should from "should";
// @ts-expect-error TS(7016): Could not find a declaration file for module 'sino... Remove this comment to see the full error message
import sinon from "sinon";
import DataStore from "../lib/stores/DataStore.js";
import PostHandler from "../lib/handlers/PostHandler.js";
import { EVENTS } from "../lib/constants.js";
const hasHeader = (res: any, header: any) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('PostHandler', () => {
    let req: any = null;
    let res: any = null;
    const fake_store = sinon.createStubInstance(DataStore);
    // @ts-expect-error TS(2304): Cannot find name 'beforeEach'.
    beforeEach((done: any) => {
        req = { headers: {}, url: '/files', host: 'localhost:3000' };
        res = new http.ServerResponse({ method: 'POST' });
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('constructor()', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('must check for naming function', () => {
            // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
            assert.throws(() => { new PostHandler(fake_store); }, Error);
            assert.doesNotThrow(() => { new PostHandler(fake_store, { namingFunction: () => '1234' }); });
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('send()', () => {
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('test errors', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('must 400 if the Upload-Length and Upload-Defer-Length headers are both missing', async () => {
                const handler = new PostHandler(fake_store, { namingFunction: () => '1234' });
                req.headers = {};
                return assert.rejects(() => handler.send(req, res), { status_code: 400 });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('must 400 if the Upload-Length and Upload-Defer-Length headers are both present', async () => {
                const handler = new PostHandler(fake_store, { namingFunction: () => '1234' });
                req.headers = { 'upload-length': '512', 'upload-defer-length': '1' };
                return assert.rejects(() => handler.send(req, res), { status_code: 400 });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('must 501 if the \'concatenation\' extension is not supported', async () => {
                const handler = new PostHandler(fake_store, { namingFunction: () => '1234' });
                req.headers = { 'upload-concat': 'partial' };
                return assert.rejects(() => handler.send(req, res), { status_code: 501 });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should send error when naming function throws', async () => {
                const fake_store = sinon.createStubInstance(DataStore);
                const handler = new PostHandler(fake_store, { namingFunction: sinon.stub().throws() });
                req.headers = { 'upload-length': 1000 };
                return assert.rejects(() => handler.send(req, res), { status_code: 500 });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should call custom namingFunction', async () => {
                const fake_store = sinon.createStubInstance(DataStore);
                const namingFunction = sinon.stub().returns('1234');
                const handler = new PostHandler(fake_store, { namingFunction });
                req.headers = { 'upload-length': 1000 };
                await handler.send(req, res);
                assert.equal(namingFunction.calledOnce, true);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should send error when store rejects', () => {
                const fake_store = sinon.createStubInstance(DataStore);
                fake_store.create.rejects({ status_code: 500 });
                const handler = new PostHandler(fake_store, { namingFunction: () => '1234' });
                req.headers = { 'upload-length': 1000 };
                return assert.rejects(() => handler.send(req, res), { status_code: 500 });
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('test successful scenarios', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('must acknowledge successful POST requests with the 201', async () => {
                const handler = new PostHandler(fake_store, { path: '/test/output', namingFunction: () => '1234' });
                req.headers = { 'upload-length': 1000, host: 'localhost:3000' };
                await handler.send(req, res);
                assert.equal(hasHeader(res, { 'Location': '//localhost:3000/test/output/1234' }), true);
                assert.equal(res.statusCode, 201);
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('events', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it(`must fire the ${EVENTS.EVENT_FILE_CREATED} event`, (done: any) => {
                const fake_store = sinon.createStubInstance(DataStore);
                const file = {};
                fake_store.create.resolves(file);
                const handler = new PostHandler(fake_store, { namingFunction: () => '1234' });
                (handler as any).on(EVENTS.EVENT_FILE_CREATED, (obj: any) => {
                    assert.strictEqual(obj.file, file);
                    done();
                });
                req.headers = { 'upload-length': 1000 };
                handler.send(req, res);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it(`must fire the ${EVENTS.EVENT_ENDPOINT_CREATED} event with absolute URL`, (done: any) => {
                const fake_store = sinon.createStubInstance(DataStore);
                const file = {};
                fake_store.create.resolves(file);
                const handler = new PostHandler(fake_store, { path: '/test/output', namingFunction: () => '1234' });
                (handler as any).on(EVENTS.EVENT_ENDPOINT_CREATED, (obj: any) => {
                    assert.strictEqual(obj.url, '//localhost:3000/test/output/1234');
                    done();
                });
                req.headers = { 'upload-length': 1000, host: 'localhost:3000' };
                handler.send(req, res);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it(`must fire the ${EVENTS.EVENT_ENDPOINT_CREATED} event with relative URL`, (done: any) => {
                const fake_store = sinon.createStubInstance(DataStore);
                const file = {};
                fake_store.create.resolves(file);
                const handler = new PostHandler(fake_store, { path: '/test/output', relativeLocation: true, namingFunction: () => '1234' });
                (handler as any).on(EVENTS.EVENT_ENDPOINT_CREATED, (obj: any) => {
                    assert.strictEqual(obj.url, '/test/output/1234');
                    done();
                });
                req.headers = { 'upload-length': 1000, host: 'localhost:3000' };
                handler.send(req, res);
            });
        });
    });
});
