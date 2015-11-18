'use strict';

const assert = require('assert');
const should = require('should');

const BaseHandler = require('../lib/handlers/BaseHandler');
const http = require('http');

const ALLOWED_METHODS = 'POST, HEAD, PATCH, OPTIONS';

describe('BaseHandler', () => {
    let res = null;
    let handler = new BaseHandler();

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
        let headers = {};
        const HEADER_NAME = 'Access-Control-Allow-Methods';
        const HEADER_VALUE = 'GET, OPTIONS';
        headers[HEADER_NAME] = HEADER_VALUE;
        handler.send(res, 200, headers);
        assert.notEqual(res._header.indexOf(`${HEADER_NAME}: ${HEADER_VALUE}`), -1)
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
