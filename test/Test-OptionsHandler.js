'use strict';

const assert = require('assert');
const should = require('should');
const http = require('http');
const OptionsHandler = require('../lib/handlers/OptionsHandler');
const DataStore = require('../lib/stores/DataStore');

const ALLOWED_METHODS = require('../lib/constants').ALLOWED_METHODS;
const ALLOWED_HEADERS = require('../lib/constants').ALLOWED_HEADERS;
const EXPOSED_HEADERS = require('../lib/constants').EXPOSED_HEADERS;
const MAX_AGE = require('../lib/constants').MAX_AGE;

let hasHeader = (res, header) => {
    let key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
}

describe('OptionsHandler', () => {
    let res = null;
    let store = new DataStore({ path: '/files' });
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
        assert.equal(hasHeader(res, headers), true)
        assert.equal(res.statusCode, 204)
        done();
    });

    it('send() should set extensions header if they exist', (done) => {
        let headers = {
            'Tus-Extension': 'creation,expiration',
        };
        store.extensions = ['creation', 'expiration'];
        let handler = new OptionsHandler(store);
        handler.send(req, res);
        assert.equal(hasHeader(res, headers), true)
        done();
    });
});
