'use strict';

const path = require('path');

const assert = require('assert');
const httpMocks = require('node-mocks-http');

const BaseHandler = require('../lib/handlers/BaseHandler');
const DataStore = require('../lib/stores/DataStore');
const http = require('http');

const ALLOWED_METHODS = 'POST, HEAD, PATCH, OPTIONS';

describe('BaseHandler', () => {

    it('constructor must require a DataStore', (done) => {
        assert.throws(() => {
            let handler = new BaseHandler();
        }, Error);
        done();
    });

    let res = null;
    let store = new DataStore({ path: '/files' });
    let handler = new BaseHandler(store);

    beforeEach((done) => {
        const METHOD = 'GET';
        res = httpMocks.createResponse({ method: METHOD });
        done();
    });

    it('send() should end the response', (done) => {
        handler.send(res, 200, {});
        assert.equal(res.finished, true)
        done();
    });

    it('send() should set a response code', (done) => {
        handler.send(res, 201, {});
        assert.equal(res.statusCode, 201)
        done();
    });

    it('send() should set headers', (done) => {
        let headers = {
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
        };
        handler.send(res, 200, headers);
        for (let header of Object.keys(headers)) {
            assert.equal(res.getHeader(header), headers[header]);
        }
        done();
    });

    describe('getFileIdFromRequest()', () => {
      const filePath = '/files'
      const filename = 'Abklz1xxRcmbf7fqUa6rHg.mp4'

      it('relativeLocation = false. should return fileId', (done) => {
          const store = new DataStore({ path: filePath });
          const handler = new BaseHandler(store);

          const req = httpMocks.createRequest({
            method: 'PATCH',
            originalUrl: path.join(filePath, filename)
          });

          const fileId = handler.getFileIdFromRequest(req);

          assert.equal(fileId, filename);
          done();
      })

      it('relativeLocation = true. should return fileId', (done) => {
          const store = new DataStore({ path: filePath, relativeLocation: true });
          const handler = new BaseHandler(store);

          const req = httpMocks.createRequest({
            method: 'PATCH',
            originalUrl: path.join('/', filename)
          });

          const fileId = handler.getFileIdFromRequest(req);

          assert.equal(fileId, filename);
          done();
      })
    })

    it('send() should write the body', (done) => {
        const body = 'Hello tus!'
        handler.send(res, 200, {}, body);
        let output = res._getData();
        assert.equal(output.match(/Hello tus!$/).index, output.length - body.length)
        done();
    });
});
