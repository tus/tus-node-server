'use strict';

const request = require('supertest');
const should = require('should');
const assert = require('assert');
const http = require('http');
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');
const TUS_RESUMABLE = require('../lib/constants').TUS_RESUMABLE;

describe('Server', () => {
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
          .expect(400, 'Upload-Length or Upload-Defer-Length required', done)
    });

    it('POST should require non negative Upload-Length number', (done) => {
        request(server.listen())
          .post(server.datastore.path)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', -3)
          .expect(400, 'Upload-Length must be non-negative', done)
    });

    it('should 404 other requests', (done) => {
        request(server.listen())
          .get('/')
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(404, 'Not found', done)
    });

    it('#listen should create an instance of http.Server', (done) => {
      let new_server = server.listen();
      assert.equal(new_server instanceof http.Server, true)
      done();
    });

});
