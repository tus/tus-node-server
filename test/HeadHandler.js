'use strict';

const assert = require('assert');
const should = require('should');
const http = require('http');
const HeadHandler = require('../lib/handlers/HeadHandler');
const DataStore = require('../lib/stores/DataStore');

let hasHeader = (res, header) => {
    let key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
}

describe('HeadHandler', () => {
    const path = '/files';
    let res = null;
    let store = new DataStore({ path });
    let handler = new HeadHandler(store);
    let req = { headers: {} };

    beforeEach((done) => {
        res = new http.ServerResponse({ method: 'HEAD' });
        done();
    });

    it('should 404 if no file id match', (done) => {
        req.headers = {};
        req.url = '/null';
        handler.send(req, res);
        assert.equal(res.statusCode, 404)
        done();
    });

    it('should 404 if no file ID ', (done) => {
        req.headers = {};
        req.url = `${path}/`;
        handler.send(req, res)
        assert.equal(res.statusCode, 404)
        done();
    });

    it('should resolve a promise with the offset', (done) => {
        req.headers = {};
        req.url = `${path}/1234`;
        handler.send(req, res).then(() => {
            assert.equal(hasHeader(res, { 'Upload-Length': 0 }), true);
            assert.equal(res.statusCode, 200);
        }).then(done);
    });
});
