'use strict';

const assert = require('assert');
const should = require('should');
const http = require('http');
const HeadHandler = require('../lib/handlers/HeadHandler');
const DataStore = require('../lib/stores/DataStore');


let pluckBody = (res) => {
    return /\n(.*)$/.exec(res.output[0])[1];
}

describe('HeadHandler', () => {
    let res = null;
    let store = new DataStore({ path: '/files' });
    let handler = new HeadHandler(store);
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
