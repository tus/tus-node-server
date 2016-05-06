'use strict';

const assert = require('assert');
const should = require('should');

const BaseHandler = require('../lib/handlers/BaseHandler');
const DataStore = require('../lib/stores/DataStore');
const http = require('http');

const ALLOWED_METHODS = 'POST, HEAD, PATCH, OPTIONS';

let hasHeader = (res, header) => {
    let key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
}

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
        res = new http.ServerResponse({ method: METHOD });
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
        assert.equal(hasHeader(res, headers), true)
        done();
    });


    it('send() should write the body', (done) => {
        const body = 'Hello tus!'
        handler.send(res, 200, {}, body);
        assert.equal(res._hasBody, true)
        assert.equal(res.output[0].match(/Hello tus!$/).index, res.output[0].length - body.length)
        done();
    });
});
