'use strict';

let request = require('supertest');
// const assert = require('assert');
const should = require('should');
const Tus = require('../lib/tus');

describe('Tus', function() {

    it('should serve requests', function(done) {
        const app = new Tus();

        app.route('/', ['GET'], (req, res) => {
            res.writeHead(200, {});
            res.write('Hello tus!');
            return res.end();
        });

        request(app.listen())
          .get('/')
          .expect(200, 'Hello tus!', done);
    });

    it('should allow for method overriding', function(done) {
        const app = new Tus();
        request(app.listen())
          .get('/')
          .set('X-HTTP-Method-Override', 'POST')
          .expect(204, '', done);
    });

    it('should 404 !GET requests with tus header', function(done) {
        const app = new Tus();
        request(app.listen())
          .post('/')
          .set('Tus-Resumable', '1.0.0')
          .expect(404, 'Not Found', done);
    });

    it('should 204 !GET requests without the tus header', function(done) {
        const app = new Tus();
        request(app.listen())
          .post('/')
          .expect(204, '', done);
    });

    it('should 404 anything not setup', function(done) {
        const app = new Tus();
        request(app.listen())
          .get('/')
          .expect(404, done)
          .expect('Content-Length', 9);
    });

    it('file create api should require an Entity-Length', function(done) {
        const app = new Tus();
        app.fileRoute('/files');

        request(app.listen())
          .post('/files')
          .set('Tus-Resumable', '1.0.0')
          .expect(400, 'Entity-Length Required', done)
    });

    it('should return a location for file create api', function(done) {
        const app = new Tus();
        app.fileRoute('/files');

        request(app.listen())
          .post('/files')
          .set('Tus-Resumable', '1.0.0')
          .set('Entity-Length', '1234')
          .expect(201, done)
          .end(function(err, res){
              res.headers.should.have.property('location');
              done();
          });
    });
});
