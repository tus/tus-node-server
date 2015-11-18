'use strict';

const assert = require('assert');
const should = require('should');
const http = require('http');
const PatchHandler = require('../lib/handlers/PatchHandler');


let pluckBody = (res) => {
    return /\n(.*)$/.exec(res.output[0])[1];
}

describe('PatchHandler', () => {
    let res = null;
    let handler = new PatchHandler();
    let req = { headers: {} };

    beforeEach((done) => {
        const METHOD = 'PATCH';
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
