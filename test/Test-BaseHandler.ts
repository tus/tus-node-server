// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'assert';
import * as httpMocks from 'node-mocks-http';
import BaseHandler from '../lib/handlers/BaseHandler.js';
import DataStore from '../lib/stores/DataStore.js';
// @ts-expect-error TS(2307): Cannot find module 'http' or its corresponding typ... Remove this comment to see the full error message
import http from 'http';
const ALLOWED_METHODS = 'POST, HEAD, PATCH, OPTIONS';
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('BaseHandler', () => {
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('constructor must require a DataStore', (done: any) => {
        assert.throws(() => {
            // @ts-expect-error TS(2554): Expected 2 arguments, but got 0.
            const handler = new BaseHandler();
        }, Error);
        done();
    });
    let res: any = null;
    // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
    const store = new DataStore({ path: '/test/output' });
    // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
    const handler = new BaseHandler(store);
    // @ts-expect-error TS(2304): Cannot find name 'beforeEach'.
    beforeEach((done: any) => {
        const METHOD = 'GET';
        // @ts-expect-error TS(2345): Argument of type '{ method: string; }' is not assi... Remove this comment to see the full error message
        res = httpMocks.createResponse({ method: METHOD });
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('write() should end the response', (done: any) => {
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 3.
        handler.write(res, 200, {});
        assert.equal(res.finished, true);
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('write() should set a response code', (done: any) => {
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 3.
        handler.write(res, 201, {});
        assert.equal(res.statusCode, 201);
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('write() should set headers', (done: any) => {
        const headers = {
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        };
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 3.
        handler.write(res, 200, headers);
        for (const header of Object.keys(headers)) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            assert.equal(res.getHeader(header), headers[header]);
        }
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('write() should write the body', (done: any) => {
        const body = 'Hello tus!';
        handler.write(res, 200, {}, body);
        const output = res._getData();
        assert.equal(output.match(/Hello tus!$/).index, output.length - body.length);
        done();
    });
});
