import assert from "assert";
import should from "should";
import http from "http";
import OptionsHandler from "../lib/handlers/OptionsHandler.js";
import DataStore from "../lib/stores/DataStore.js";
import { ALLOWED_METHODS as ALLOWED_METHODS$0 } from "../lib/constants.js";
import { ALLOWED_HEADERS as ALLOWED_HEADERS$0 } from "../lib/constants.js";
import { EXPOSED_HEADERS as EXPOSED_HEADERS$0 } from "../lib/constants.js";
import { MAX_AGE as MAX_AGE$0 } from "../lib/constants.js";
const ALLOWED_METHODS = { ALLOWED_METHODS: ALLOWED_METHODS$0 }.ALLOWED_METHODS;
const ALLOWED_HEADERS = { ALLOWED_HEADERS: ALLOWED_HEADERS$0 }.ALLOWED_HEADERS;
const EXPOSED_HEADERS = { EXPOSED_HEADERS: EXPOSED_HEADERS$0 }.EXPOSED_HEADERS;
const MAX_AGE = { MAX_AGE: MAX_AGE$0 }.MAX_AGE;
let hasHeader = (res, header) => {
    let key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};
describe('OptionsHandler', () => {
    let res = null;
    let store = new DataStore({ path: '/test/output' });
    let handler = new OptionsHandler(store);
    let req = { headers: {} };
    beforeEach((done) => {
        const METHOD = 'OPTIONS';
        res = new http.ServerResponse({ method: METHOD });
        done();
    });
    it('send() should set headers and 204', (done) => {
        let headers = {
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
    it('send() should set extensions header if they exist', (done) => {
        let headers = {
            'Tus-Extension': 'creation,expiration',
        };
        store.extensions = ['creation', 'expiration'];
        let handler = new OptionsHandler(store);
        handler.send(req, res);
        assert.equal(hasHeader(res, headers), true);
        done();
    });
});
