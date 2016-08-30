/* eslint-env node, mocha */
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
    const path = '/files';
    let res = null;
    const namingFunction = (req) => req.url.replace(/\//g, '-');
    const store = new DataStore({ path, namingFunction });
    const handler = new PostHandler(store);
    const req = { headers: {}, url: '/files' };

    beforeEach((done) => {
        res = new http.ServerResponse({ method: 'POST' });
        done();
    });

    describe('send()', () => {
        it('must 412 if the Upload-Length and Upload-Defer-Length headers are both missing', (done) => {
            req.headers = {};
            handler.send(req, res).then(() => {
                assert.equal(res.statusCode, 412);
                return done();
            })
            .catch(done);
        });

        it('must acknowledge successful POST requests with the 201', (done) => {
            req.headers = { 'upload-length': 1000, host: 'localhost:3000' };

            handler.send(req, res)
                .then(() => {
                    assert.equal(hasHeader(res, { 'Location': '//localhost:3000/files/-files' }), true);
                    assert.equal(res.statusCode, 201);
                    return done();
                })
                .catch(done);
        });

    });

});
