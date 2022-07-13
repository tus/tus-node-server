/* eslint-env node, mocha */
'use strict';


const assert = require('assert');
const http = require('http');

const should = require('should');
const sinon = require('sinon');

const DataStore = require('../lib/stores/DataStore');
const PostHandler = require('../lib/handlers/PostHandler');
const { EVENTS } = require('../lib/constants');

const hasHeader = (res, header) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};

describe.only('PostHandler', () => {
    let req = null;
    let res = null;

    const fake_store = sinon.createStubInstance(DataStore);
    fake_store.generateFileName.returns("1234");
    fake_store.create.resolves({});

    beforeEach((done) => {
        req = { headers: {}, url: '/files', host: 'localhost:3000' };
        res = new http.ServerResponse({ method: 'POST' });
        done();
    });

    describe('send()', () => {

        describe('test errors', () => {
            it('must 412 if the Upload-Length and Upload-Defer-Length headers are both missing', async() => {
                const handler = new PostHandler(fake_store);

                req.headers = {};
                await handler.send(req, res);
                assert.equal(res.statusCode, 412);
            });

            it('must 412 if the Upload-Length and Upload-Defer-Length headers are both present', async() => {
                const handler = new PostHandler(fake_store);
                req.headers = { 'upload-length': '512', 'upload-defer-length': '1'};
                await handler.send(req, res);
                assert.equal(res.statusCode, 412);
            });

            it('must 501 if the \'concatenation\' extension is not supported', async() => {
                const handler = new PostHandler(fake_store);
                req.headers = { 'upload-concat': 'partial' };
                await handler.send(req, res);
                assert.equal(res.statusCode, 501);
            });

            it('should send error when naming function throws', async() => {
                const fake_store = sinon.createStubInstance(DataStore);
                fake_store.generateFileName.throws();

                const handler = new PostHandler(fake_store);

                req.headers = { 'upload-length': 1000 };
                await handler.send(req, res)

                assert.equal(res.statusCode, 500);
            });

            it('should send error when naming store rejects', async() => {
                const fake_store = sinon.createStubInstance(DataStore);
                fake_store.generateFileName.returns('1234');
                fake_store.create.rejects();

                const handler = new PostHandler(fake_store);

                req.headers = { 'upload-length': 1000 };
                await handler.send(req, res)

                assert.equal(res.statusCode, 500);
            });

            // it('should use custom naming function when provided', (done) => {
            //     const namingFunction = (incomingReq) => incomingReq.url.replace(/\//g, '-');
            //     const file_store = new FileStore({ path: STORE_PATH, namingFunction });
            //     file_store.create(file)
            //         .then((newFile) => {
            //             assert.equal(newFile instanceof File, true);
            //             assert.equal(newFile.id, '-files');
            //             return done();
            //         })
            //         .catch(done);
            // });
        })

        describe('test successful scenarios', () => {
            it('must acknowledge successful POST requests with the 201', async () => {
                const handler = new PostHandler(fake_store);
                req.headers = { 'upload-length': 1000, host: 'localhost:3000' };
                await handler.send(req, res)
                assert.equal(hasHeader(res, { 'Location': '//localhost:3000/test/output/1234' }), true);
                assert.equal(res.statusCode, 201);
            });

        })

        describe('events', () => {
            it('should emit object returned by store', (done) => {
                const fake_store = sinon.createStubInstance(DataStore);
                fake_store.generateFileName.returns("1234");

                const file = {};
                fake_store.create.resolves(file);

                const handler = new PostHandler(fake_store);
                handler.on(EVENTS.EVENT_FILE_CREATED, (obj) => {
                    assert.strictEqual(obj.file, file);
                    done();
                });

                req.headers = { 'upload-length': 1000 };
                handler.send(req, res);
            })
        });
    });
});