'use strict';

const request = require('supertest');
const should = require('should');
const assert = require('assert');
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');

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

    it('should 204 !GET requests without the Tus header', (done) => {
        request(server.listen())
          .post('/')
          .expect(204, '', done);
    });

    it('should 404 other requests', (done) => {
        request(server.listen())
          .get('/')
          .set('Tus-Resumable', '1.0.0')
          .expect(404, 'Not found', done)
    });

    it('should implement creation extension', (done) => {
        request(server.listen())
          .post('/files')
          .set('Tus-Resumable', '1.0.0')
          .set('Upload-Length', '1234')
          .expect(201, done)
          .end((err, res) => {
              res.headers.should.have.property('location');
              done();
          });
    });

    it('should respond the tus header', (done) => {
        request(server.listen())
          .head('/')
          .set('Tus-Resumable', '1.0.0')
          .expect(204, null, done)
          .end((err, res) => {
              res.headers.should.have.property('tus-resumable');
              res.headers['tus-resumable'].should.equal('1.0.0');
              done();
          });
    });
});
