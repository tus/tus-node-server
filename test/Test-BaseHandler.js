'use strict';

const assert = require('assert');
const httpMocks = require('node-mocks-http');

const BaseHandler = require('../lib/handlers/BaseHandler');
const DataStore = require('../lib/stores/DataStore');
const http = require('http');

const ALLOWED_METHODS = 'POST, HEAD, PATCH, OPTIONS';

describe('BaseHandler', () => {

    it('constructor must require a DataStore', (done) => {
        assert.throws(() => {
            let handler = new BaseHandler();
        }, Error);
        done();
    });

    let res = null;
    let store = new DataStore({ path: '/files' });
    let handler = new BaseHandler(store);

    beforeEach((done) => {
        const METHOD = 'GET';
        res = httpMocks.createResponse({ method: METHOD });
        done();
    });

    it('send() should end the response', (done) => {
        handler.send(res, 200, {});
        assert.equal(res.finished, true)
        done();
    });

    it('send() should set a response code', (done) => {
        handler.send(res, 201, {});
        assert.equal(res.statusCode, 201)
        done();
    });

    it('send() should set headers', (done) => {
        let headers = {
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        };
        handler.send(res, 200, headers);
        for (let header of Object.keys(headers)) {
            assert.equal(res.getHeader(header), headers[header]);
        }
        done();
    });


    it('send() should write the body', (done) => {
        const body = 'Hello tus!'
        handler.send(res, 200, {}, body);
        let output = res._getData();
        assert.equal(output.match(/Hello tus!$/).index, output.length - body.length)
        done();
    });
});
