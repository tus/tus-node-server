// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'assert';
import should from 'should';
// @ts-expect-error TS(2307): Cannot find module 'http' or its corresponding typ... Remove this comment to see the full error message
import http from 'http';
import OptionsHandler from '../lib/handlers/OptionsHandler.js';
import DataStore from '../lib/stores/DataStore.js';
import { ALLOWED_METHODS as ALLOWED_METHODS$0 } from '../lib/constants.js';
import { ALLOWED_HEADERS as ALLOWED_HEADERS$0 } from '../lib/constants.js';
import { EXPOSED_HEADERS as EXPOSED_HEADERS$0 } from '../lib/constants.js';
import { MAX_AGE as MAX_AGE$0 } from '../lib/constants.js';
const ALLOWED_METHODS = { ALLOWED_METHODS: ALLOWED_METHODS$0 }.ALLOWED_METHODS;
const ALLOWED_HEADERS = { ALLOWED_HEADERS: ALLOWED_HEADERS$0 }.ALLOWED_HEADERS;
const EXPOSED_HEADERS = { EXPOSED_HEADERS: EXPOSED_HEADERS$0 }.EXPOSED_HEADERS;
const MAX_AGE = { MAX_AGE: MAX_AGE$0 }.MAX_AGE;
const hasHeader = (res: any, header: any) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('OptionsHandler', () => {
    let res: any = null;
    // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
    const store = new DataStore({ path: '/test/output' });
    // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
    const handler = new OptionsHandler(store);
    const req = { headers: {} };
    // @ts-expect-error TS(2304): Cannot find name 'beforeEach'.
    beforeEach((done: any) => {
        const METHOD = 'OPTIONS';
        res = new http.ServerResponse({ method: METHOD });
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('send() should set headers and 204', (done: any) => {
        const headers = {
            'Access-Control-Allow-Methods': ALLOWED_METHODS,
            'Access-Control-Allow-Headers': ALLOWED_HEADERS,
            'Access-Control-Expose-Headers': EXPOSED_HEADERS,
            'Access-Control-Max-Age': MAX_AGE,
        };
        handler.send(req, res);
        assert.equal(hasHeader(res, headers), true);
        assert.equal(res.statusCode, 204);
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('send() should set extensions header if they exist', (done: any) => {
        const headers = {
            'Tus-Extension': 'creation,expiration',
        };
        store.extensions = ['creation', 'expiration'];
        // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
        const handler = new OptionsHandler(store);
        handler.send(req, res);
        assert.equal(hasHeader(res, headers), true);
        done();
    });
});
