'use strict';

const assert = require('assert');
const should = require('should');
const http = require('http');
const HeadHandler = require('../lib/handlers/HeadHandler');


let pluckBody = (res) => {
    return /\n(.*)$/.exec(res.output[0])[1];
}

describe('HeadHandler', () => {
    let res = null;
    let handler = new HeadHandler();
    let req = { headers: {} };

    beforeEach((done) => {
        const METHOD = 'HEAD';
        res = new http.ServerResponse({ method: METHOD });
        done();
    });

    it('should not be implemented yet', (done) => {
        req.headers = {};
        handler.send(req, res);
        assert.equal(res.statusCode, 501)
        done();
    });
});
