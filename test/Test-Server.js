'use strict';

const request = require('supertest');
const should = require('should');
const assert = require('assert');
const http = require('http');
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');
const TUS_RESUMABLE = require('../lib/constants').TUS_RESUMABLE;

let hasHeader = (res, header) => {
    let key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
}

describe('Server', () => {

    it('datastore setter must require a DataStore subclass', (done) => {
        assert.throws(() => { server.datastore = {}; }, Error);
        done();
    });

    it('setting the DataStore should attach handlers', (done) => {
        const server = new Server();
        server.handlers.should.be.empty();
        server.datastore = new DataStore({
            path: '/files'
        });
        server.handlers.should.have.property('HEAD');
        server.handlers.should.have.property('OPTIONS');
        server.handlers.should.have.property('POST');
        server.handlers.should.have.property('PATCH');
        done();
    });

    const server = new Server();
    server.datastore = new DataStore({
        path: '/files'
    });

    it('should 412 !OPTIONS requests without the Tus header', (done) => {
        request(server.listen())
          .post('/')
          .expect(412, '', done);
    });

    it('OPTIONS should return configuration', (done) => {
        request(server.listen())
          .options('/')
          .expect(204, '', done)
          .end((err, res) => {
            res.headers.should.have.property('access-control-allow-methods');
            res.headers.should.have.property('access-control-allow-headers');
            res.headers.should.have.property('access-control-max-age');
            res.headers.should.have.property('tus-resumable');
            res.headers['tus-resumable'].should.equal(TUS_RESUMABLE);
            done();
          });
    });

    it('HEAD should 404 non files', (done) => {
        request(server.listen())
          .head('/')
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(404, '', done)
    });

    it('POST should require Upload-Length header', (done) => {
        request(server.listen())
          .post(server.datastore.path)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(400, {}, done)
    });

    it('POST should require non negative Upload-Length number', (done) => {
        request(server.listen())
          .post(server.datastore.path)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', -3)
          .expect(400, {}, done)
    });

    it('should 404 other requests', (done) => {
        request(server.listen())
          .get('/')
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(404, 'Not found', done)
    });

    it('listen() should create an instance of http.Server', (done) => {
      let new_server = server.listen();
      assert.equal(new_server instanceof http.Server, true)
      done();
    });

    it('handle() should allow overriding the HTTP method', (done) => {
      let req = { headers: { 'x-http-method-override': 'OPTIONS' }, method: 'GET'};
      let res = new http.ServerResponse({ method: 'OPTIONS'});
      server.handle(req, res);
      assert.equal(req.method, 'OPTIONS')
      done();
    });

    it('handle() should allow overriding the HTTP method', (done) => {
      let origin = 'vimeo.com';
      let req = { headers: { origin }, method: 'OPTIONS', url: '/'};
      let res = new http.ServerResponse({ method: 'OPTIONS'});
      server.handle(req, res);
      console.log(res._header)
      assert.equal(hasHeader(res, {
        'Access-Control-Allow-Origin': origin,
       }), true)
      done();
    });
});
