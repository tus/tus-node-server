'use strict';

let request = require('supertest');
// const assert = require('assert');
const should = require('should');
const Tus = require('../lib/tus');
const FileStore = require('../lib/stores/filestore');

describe('Tus', () => {

    it('should serve requests', (done) => {
        const server = new Tus();

        server.route('/', ['GET'], (req, res) => {
            res.writeHead(200, {});
            res.write('Hello tus!');
            return res.end();
        });

        request(server.listen())
          .get('/')
          .expect(200, 'Hello tus!', done);
    });

    it('should allow for method overriding', (done) => {
        const server = new Tus();
        request(server.listen())
          .get('/')
          .set('X-HTTP-Method-Override', 'POST')
          .expect(204, '', done);
    });

    it('should 404 !GET requests with tus header', (done) => {
        const server = new Tus();
        request(server.listen())
          .post('/')
          .set('Tus-Resumable', '1.0.0')
          .expect(404, 'Not Found', done);
    });

    it('should 204 !GET requests without the tus header', (done) => {
        const server = new Tus();
        request(server.listen())
          .post('/')
          .expect(204, '', done);
    });

    it('should 404 anything not setup', (done) => {
        const server = new Tus();
        request(server.listen())
          .get('/')
          .expect(404, done)
          .expect('Content-Length', 9);
    });

    it('file create api should require an Entity-Length', (done) => {
        const server = new Tus();
        server.datastore = new FileStore({
            path: '/files'
        });

        request(server.listen())
          .post('/files')
          .set('Tus-Resumable', '1.0.0')
          .expect(400, 'Entity-Length Required', done)
    });

    it('should return a location for file create api', (done) => {
        const server = new Tus();
        server.datastore = new FileStore({
            path: '/files'
        });

        request(server.listen())
          .post('/files')
          .set('Tus-Resumable', '1.0.0')
          .set('Entity-Length', '1234')
          .expect(201, done)
          .end((err, res) => {
              res.headers.should.have.property('location');
              done();
          });
    });
});
