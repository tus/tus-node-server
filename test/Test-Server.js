/* eslint-env node, mocha */
'use strict';

const request = require('supertest');
const should = require('should');
const assert = require('assert');
const http = require('http');
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');
const TUS_RESUMABLE = require('../lib/constants').TUS_RESUMABLE;
const EVENTS = require('../lib/constants').EVENTS;

const hasHeader = (res, header) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};

describe('Server', () => {
    describe('instantiation', () => {
        it('datastore setter must require a DataStore subclass', (done) => {
            assert.throws(() => {
                const server = new Server();
                server.datastore = {};
            }, Error);
            done();
        });

        it('setting the DataStore should attach handlers', (done) => {
            const server = new Server();
            server.handlers.should.be.empty();
            server.datastore = new DataStore({
                path: '/files',
            });
            server.handlers.should.have.property('HEAD');
            server.handlers.should.have.property('OPTIONS');
            server.handlers.should.have.property('POST');
            server.handlers.should.have.property('PATCH');
            done();
        });
    });
    describe('listen', () => {
        let server;
        before(() => {
            server = new Server();
            server.datastore = new DataStore({
                path: '/files',
            });
        });

        it('should create an instance of http.Server', (done) => {
            const new_server = server.listen();
            assert.equal(new_server instanceof http.Server, true);
            new_server.close();
            done();
        });
    });

    describe('get', () => {
        let server;
        let listener;
        before(() => {
            server = new Server();
            server.datastore = new DataStore({
                path: '/files',
            });

            server.get('/some_url', (req, res) => {
                res.writeHead(200);
                res.write('Hello world!\n');
                res.end();
            });

            listener = server.listen();
        });

        after(() => {
          listener.close();
        })

        it('should respond to user implemented GET requests', (done) => {
            request(listener)
              .get('/some_url')
              .expect(200, 'Hello world!\n', done);
        });

        it('should 404 non-user implemented GET requests', (done) => {
            request(listener)
              .get('/not_here')
              .expect(404, 'Not found\n', done);
        });
    });

    describe('handle', () => {
        let server;
        let listener;
        before(() => {
            server = new Server();
            server.datastore = new DataStore({
                path: '/files',
            });

            listener = server.listen();
        });

        after(() => {
          listener.close();
        })

        it('should 412 !OPTIONS requests without the Tus header', (done) => {
            request(listener)
              .post('/')
              .expect(412, 'Tus-Resumable Required\n', done);
        });

        it('OPTIONS should return configuration', (done) => {
            request(listener)
            .options('/')
            .expect(204, '', (err, res) => {
                res.headers.should.have.property('access-control-allow-methods');
                res.headers.should.have.property('access-control-allow-headers');
                res.headers.should.have.property('access-control-max-age');
                res.headers.should.have.property('tus-resumable');
                res.headers['tus-resumable'].should.equal(TUS_RESUMABLE);
                done(err);
            });
        });

        it('HEAD should 404 non files', (done) => {
            request(listener)
              .head('/')
              .set('Tus-Resumable', TUS_RESUMABLE)
              .expect(404, {}, done);
        });

        it('POST should require Upload-Length header', (done) => {
            request(listener)
              .post(server.datastore.path)
              .set('Tus-Resumable', TUS_RESUMABLE)
              .expect(412, {}, done);
        });

        it('POST should require non negative Upload-Length number', (done) => {
            request(listener)
              .post(server.datastore.path)
              .set('Tus-Resumable', TUS_RESUMABLE)
              .set('Upload-Length', -3)
              .expect(412, 'Invalid upload-length\n', done);
        });

        it('POST should validate the metadata header', (done) => {
            request(listener)
              .post(server.datastore.path)
              .set('Tus-Resumable', TUS_RESUMABLE)
              .set('Upload-Metadata', '')
              .expect(412, 'Invalid upload-metadata\n', done);
        });

        it('POST should ignore invalid Content-Type header', (done) => {
            request(listener)
              .post(server.datastore.path)
              .set('Tus-Resumable', TUS_RESUMABLE)
              .set('Upload-Length', 300)
              .set('Upload-Metadata', 'foo aGVsbG8=, bar d29ynGQ=')
              .set('Content-Type', 'application/false')
              .expect(201, {}, (err, res) => {
                  res.headers.should.have.property('location');
                  done(err);
              });
        });

        it('should 404 other requests', (done) => {
            request(listener)
              .get('/')
              .set('Tus-Resumable', TUS_RESUMABLE)
              .expect(404, 'Not found\n', done);
        });

        it('should allow overriding the HTTP method', (done) => {
            const req = { headers: { 'x-http-method-override': 'OPTIONS' }, method: 'GET'};
            const res = new http.ServerResponse({ method: 'OPTIONS' });
            server.handle(req, res);
            assert.equal(req.method, 'OPTIONS');
            done();
        });

        it('should allow overriding the HTTP method', (done) => {
            const origin = 'vimeo.com';
            const req = { headers: { origin }, method: 'OPTIONS', url: '/' };
            const res = new http.ServerResponse({ method: 'OPTIONS' });
            server.handle(req, res);
            assert.equal(hasHeader(res, {
                'Access-Control-Allow-Origin': origin,
            }), true);
            done();
        });
    });

    describe('hooks', () => {
        let server;
        let listener;
        beforeEach(() => {
            server = new Server();
            server.datastore = new DataStore({
                path: '/files',
            });

            listener = server.listen();
        });

        afterEach(() => {
          listener.close();
        })

        it('should fire when an endpoint is created', (done) => {
            server.on(EVENTS.EVENT_ENDPOINT_CREATED, (event) => {
                event.should.have.property('url');
                done();
            });

            request(listener)
              .post(server.datastore.path)
              .set('Tus-Resumable', TUS_RESUMABLE)
              .set('Upload-Length', 12345678)
              .end((err) => { if(err) done(err) });
        });

        it('should fire when a file is created', (done) => {
            server.on(EVENTS.EVENT_FILE_CREATED, (event) => {
                event.should.have.property('file');
                done();
            });

            request(listener)
              .post(server.datastore.path)
              .set('Tus-Resumable', TUS_RESUMABLE)
              .set('Upload-Length', 12345678)
              .end((err) => { if(err) done(err) });
        });

        it('should fire when an upload is finished', (done) => {
            server.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
                event.should.have.property('file');
                done();
            });

            request(listener)
              .patch(`${server.datastore.path}/file`)
              .set('Tus-Resumable', TUS_RESUMABLE)
              .set('Upload-Offset', 0)
              .set('Content-Type', 'application/offset+octet-stream')
              .end((err) => { if(err) done(err) });
        });
    });
});
