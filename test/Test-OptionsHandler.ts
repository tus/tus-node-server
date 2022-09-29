import 'should';

import assert from 'node:assert/strict';
import http from 'node:http';

import OptionsHandler from '../lib/handlers/OptionsHandler';
import DataStore from '../lib/stores/DataStore';
import { ALLOWED_METHODS, ALLOWED_HEADERS, EXPOSED_HEADERS, MAX_AGE } from '../lib/constants';

const hasHeader = (res: any, header: any) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};

describe('OptionsHandler', () => {
    // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
    const store = new DataStore({ path: '/test/output' });
    // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
    const handler = new OptionsHandler(store);
    const req: { headers: Record<string, string> } = { headers: {} };
    // @ts-expect-error
    let res: http.ServerResponse<http.IncomingMessage> = new http.ServerResponse({ method: 'OPTIONS' });

    beforeEach((done: any) => {
        const METHOD = 'OPTIONS';
    // @ts-expect-error
        res = new http.ServerResponse({ method: METHOD });
        done();
    });

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
