/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const should = require('should');
const http = require('http');
const DataStore = require('../lib/stores/DataStore');
const PostHandler = require('../lib/handlers/PostHandler');
const { EVENTS } = require('../lib/constants');

const parseHeader = (res, header) => {
    const match = new RegExp(`${header}: (.+)\r\n`).exec(res._header)
    const value = match && match[1]
    if (!value) {
        return null
    }

    return value
}

describe.only('PostHandler', () => {
    const path = '/test/output';
    let res = null;
    const namingFunction = (req) => req.url.replace(/\//g, '-');
    const store = new DataStore({ path, namingFunction });
    const handler = new PostHandler(store);
    const req = { headers: {}, url: '/test/output' };

    beforeEach((done) => {
        res = new http.ServerResponse({ method: 'POST' });
        done();
    });

    ;[
        ['/', '//localhost:3000/-test-output', false],
        [' /test ', '//localhost:3000/test/-test-output', false],
        ['/', '/-test-output', true],
        [' /test ', '/test/-test-output', true]
    ].forEach(([path, expectedUrl, relative]) => {

        it(`must sanitize ${path} in file url`, (done) => {
            const store = new DataStore({path, namingFunction, relativeLocation: relative})
            const handler = new PostHandler(store)
            req.headers = { 'upload-length': 1000, host: 'localhost:3000' };

            handler.on(EVENTS.EVENT_ENDPOINT_CREATED, (event) => {
                assert.equal(event.url, expectedUrl)
            })

            handler.send(req, res).then(() => {
                assert.equal(parseHeader(res, 'Location'), expectedUrl);
                return done();
            })
            .catch(done);
        });

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
                    assert.equal(parseHeader(res, 'Location'), '//localhost:3000/test/output/-test-output');
                    assert.equal(res.statusCode, 201);
                    return done();
                })
                .catch(done);
        });

    });

});
