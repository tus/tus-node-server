'use strict';

const request = require('supertest');
const should = require('should');
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');

describe('Server', () => {
    const server = new Server();
    server.datastore = new DataStore({
        path: '/files'
    });

    it('should allow for method overriding', (done) => {
        
        request(server.listen())
          .get('/')
          .set('X-HTTP-Method-Override', 'POST')
          .expect(204, '', done);
    });

    it('should 204 !GET requests without the Tus header', (done) => {
        request(server.listen())
          .post('/')
          .expect(204, '', done);
    });

    it('file create api should require an Entity-Length', (done) => {
        request(server.listen())
          .post('/files')
          .set('Tus-Resumable', '1.0.0')
          .expect(400, 'Entity-Length Required', done)
    });

    it('should return a location for file create api', (done) => {
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
