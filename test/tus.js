'use strict';

const request = require('supertest');
// const assert = require('assert');
const should = require('should');
const Tus = require('../lib/tus');
const DataStore = require('../lib/stores/datastore');

describe('Tus', () => {

    it('should allow for method overriding', (done) => {
        const server = new Tus();
        request(server.listen())
          .get('/')
          .set('X-HTTP-Method-Override', 'POST')
          .expect(204, '', done);
    });

    it('should 204 !GET requests without the tus header', (done) => {
        const server = new Tus();
        request(server.listen())
          .post('/')
          .expect(204, '', done);
    });

    it('file create api should require an Entity-Length', (done) => {
        const server = new Tus();
        server.datastore = new DataStore({
            path: '/files'
        });

        request(server.listen())
          .post('/files')
          .set('Tus-Resumable', '1.0.0')
          .expect(400, 'Entity-Length Required', done)
    });

    it('should return a location for file create api', (done) => {
        const server = new Tus();
        server.datastore = new DataStore({
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
