/* eslint-env node, mocha */
/* eslint no-unused-vars: ["error", { "vars": "none" }] */
'use strict';

const assert = require('assert');
const should = require('should');
const http = require('http');
const DataStore = require('../lib/stores/DataStore');
const PostHandler = require('../lib/handlers/PostHandler');

const hasHeader = (res, header) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};

describe('PostHandler', () => {
    let res = null;
    const namingFunction = function(req) { return req.url.replace(/\//g, '-'); };
    let store = new DataStore({ path: '/files',  namingFunction });
    let handler = new PostHandler(store);
    let req = { headers: {} };

    beforeEach((done) => {
        const METHOD = 'POST';
        res = new http.ServerResponse({ method: METHOD });
        done();
    });

    describe('send()', () => {
        it('must 412 if the Upload-Length and Upload-Defer-Length headers are both missing', (done) => {
            req.headers = {};
            handler.send(req, res).then(() => {
                assert.equal(res.statusCode, 412);
            });
            done();
        });

        it('must acknowledge successful POST requests with the 201', (done) => {
            const req = { headers: { 'upload-length': 1000, host: 'localhost:3000' }, url: '/files' };

            handler.send(req, res)
                .then(() => {
                    assert.equal(hasHeader(res, { 'Location': 'http://localhost:3000/files/-files' }), true);
                    assert.equal(res.statusCode, 201);
                    return;
                })
                .then(done)
                .catch(done);
        });    

    });

});
