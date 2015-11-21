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

    it('should 404 if no file is there', (done) => {
        req.headers = {};
        req.url = '/file/1234';
        handler.send(req, res);
        assert.equal(res.statusCode, 404)
        done();
    });
});
