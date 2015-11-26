'use strict';

const assert = require('assert');
const should = require('should');
const http = require('http');
const DataStore = require('../lib/stores/DataStore');
const PostHandler = require('../lib/handlers/PostHandler');

let pluckBody = (res) => {
    return /\n(.*)$/.exec(res.output[0])[1];
}

describe('PostHandler', () => {
    let res = null;
    let store = new DataStore({ path: '/files' });
    let handler = new PostHandler(store);
    let req = { headers: {} };

    beforeEach((done) => {
        const METHOD = 'POST';
        res = new http.ServerResponse({ method: METHOD });
        done();
    });

    it('MUST require the Upload-Length or Upload-Defer-Length required header', (done) => {
        req.headers = {};
        handler.send(req, res);
        assert.equal(res.statusCode, 400)
        assert.equal(pluckBody(res), 'Upload-Length or Upload-Defer-Length required');
        done();
    });

    it('Upload-Length MUST be a non-negative integer', (done) => {
        req.headers = {
            'upload-length': -2
        };
        handler.send(req, res);
        assert.equal(res.statusCode, 400)
        assert.equal(pluckBody(res), 'Upload-Length must be non-negative');
        done();
    });

});
