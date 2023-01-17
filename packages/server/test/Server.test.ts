/* eslint-disable no-throw-literal */
import 'should'

import {strict as assert} from 'node:assert'
import http from 'node:http'

import request from 'supertest'

import {Server} from '../src'
import {FileStore} from '@tus/file-store'
import {DataStore} from '../src/models'
import {TUS_RESUMABLE, EVENTS} from '../src/constants'

// Test server crashes on http://{some-ip} so we remove the protocol...
const removeProtocol = (location: string) => location.slice(6)

describe('Server', () => {
  describe('instantiation', () => {
    it('constructor must require options', () => {
      assert.throws(() => {
        // @ts-expect-error missing argument
        new Server()
      }, Error)
      assert.throws(() => {
        // @ts-expect-error missing argument
        new Server({})
      }, Error)
    })

    it('should accept valid options', () => {
      assert.doesNotThrow(() => {
        new Server({path: '/files', datastore: new DataStore()})
      })
      assert.doesNotThrow(() => {
        new Server({
          path: '/files',
          datastore: new DataStore(),
          namingFunction() {
            return '1234'
          },
        })
      })
    })

    it('should throw on invalid namingFunction', () => {
      assert.throws(() => {
        new Server({
          path: '/files',
          // @ts-expect-error invalid argument
          namingFunction: '1234',
          datastore: new DataStore(),
        })
      }, Error)
    })

    it('setting the DataStore should attach handlers', (done) => {
      const server = new Server({path: '/files', datastore: new DataStore()})
      server.handlers.should.have.property('HEAD')
      server.handlers.should.have.property('OPTIONS')
      server.handlers.should.have.property('POST')
      server.handlers.should.have.property('PATCH')
      server.handlers.should.have.property('DELETE')
      done()
    })
  })

  describe('listen', () => {
    let server: InstanceType<typeof Server>

    before(() => {
      server = new Server({path: '/test/output', datastore: new DataStore()})
    })

    it('should create an instance of http.Server', (done) => {
      const new_server = server.listen()
      assert.equal(new_server instanceof http.Server, true)
      new_server.close()
      done()
    })
  })

  describe('get', () => {
    let server: InstanceType<typeof Server>
    let listener: http.Server

    before(() => {
      server = new Server({path: '/test/output', datastore: new DataStore()})
      server.get('/some_url', (_, res) => {
        res.writeHead(200)
        res.write('Hello world!\n')
        res.end()
      })
      listener = server.listen()
    })

    after(() => {
      listener.close()
    })

    it('should respond to user implemented GET requests', (done) => {
      request(listener).get('/some_url').expect(200, 'Hello world!\n', done)
    })

    it('should 404 non-user implemented GET requests', (done) => {
      request(listener).get('/not_here').expect(404, done)
    })
  })

  describe('handle', () => {
    let server: InstanceType<typeof Server>
    let listener: http.Server

    before(() => {
      server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory: './test/output'}),
      })
      listener = server.listen()
    })

    after(() => {
      listener.close()
    })

    it('should 412 !OPTIONS requests without the Tus header', (done) => {
      request(listener).post('/').expect(412, 'Tus-Resumable Required\n', done)
    })

    it('OPTIONS should return configuration', (done) => {
      request(listener)
        .options('/')
        .expect(204, '', (err, res) => {
          res.headers.should.have.property('access-control-allow-methods')
          res.headers.should.have.property('access-control-allow-headers')
          res.headers.should.have.property('access-control-max-age')
          res.headers.should.have.property('tus-resumable')
          res.headers['tus-resumable'].should.equal(TUS_RESUMABLE)
          done(err)
        })
    })

    it('HEAD should 404 non files', (done) => {
      request(listener)
        .head('/')
        .set('Tus-Resumable', TUS_RESUMABLE)
        .expect(404, {}, done)
    })

    it('POST should require Upload-Length header', (done) => {
      request(listener)
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .expect(400, done)
    })

    it('POST should require non negative Upload-Length number', (done) => {
      request(listener)
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '-3')
        .expect(400, 'Invalid upload-length\n', done)
    })

    it('POST should validate the metadata header', (done) => {
      request(listener)
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Metadata', '')
        .expect(400, 'Invalid upload-metadata\n', done)
    })

    it('DELETE should return 404 when file does not exist', (done) => {
      request(server.listen())
        .delete(`${server.options.path}/123`)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .expect(404, 'The file for this url was not found\n', done)
    })

    it('DELETE should return 404 on invalid paths', (done) => {
      request(server.listen())
        .delete('/this/is/wrong/123')
        .set('Tus-Resumable', TUS_RESUMABLE)
        .expect(404, 'The file for this url was not found\n', done)
    })

    it('DELETE should return 204 on proper deletion', (done) => {
      request(server.listen())
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '12345678')
        .then((res) => {
          request(server.listen())
            .delete(removeProtocol(res.headers.location))
            .set('Tus-Resumable', TUS_RESUMABLE)
            .expect(204, done)
        })
    })

    it('POST should ignore invalid Content-Type header', (done) => {
      request(listener)
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '300')
        .set('Upload-Metadata', 'is_confidential')
        .set('Content-Type', 'application/false')
        .expect(201, {}, (err, res) => {
          res.headers.should.have.property('location')
          done(err)
        })
    })

    it('should 404 other requests', (done) => {
      request(listener).get('/').set('Tus-Resumable', TUS_RESUMABLE).expect(404, {}, done)
    })

    it('should allow overriding the HTTP method', (done) => {
      const req = {
        headers: {'x-http-method-override': 'OPTIONS'},
        method: 'GET',
      }
      // @ts-expect-error todo
      const res = new http.ServerResponse({method: 'OPTIONS'})
      // @ts-expect-error todo
      server.handle(req, res)
      assert.equal(req.method, 'OPTIONS')
      done()
    })

    it('should allow overriding the HTTP method', (done) => {
      const origin = 'vimeo.com'
      const req = {headers: {origin}, method: 'OPTIONS', url: '/'}
      // @ts-expect-error todo
      const res = new http.ServerResponse({method: 'OPTIONS'})
      // @ts-expect-error todo
      server.handle(req, res)
      assert.equal(res.hasHeader('Access-Control-Allow-Origin'), true)
      done()
    })
  })

  describe('hooks', () => {
    let server: InstanceType<typeof Server>
    let listener: http.Server

    beforeEach(() => {
      server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory: './test/output'}),
      })
      listener = server.listen()
    })

    afterEach(() => {
      listener.close()
    })

    it('should fire when an endpoint is created', (done) => {
      server.on(EVENTS.POST_CREATE, (_, __, upload, url) => {
        assert.ok(url)
        assert.equal(upload.size, 12_345_678)
        done()
      })
      request(listener)
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '12345678')
        .end((err) => {
          if (err) {
            done(err)
          }
        })
    })

    it('should fire when a file is deleted', (done) => {
      server.on(EVENTS.POST_TERMINATE, (req, id) => {
        assert.ok(req)
        assert.ok(id)
        done()
      })
      request(server.listen())
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '12345678')
        .then((res) => {
          request(server.listen())
            .delete(removeProtocol(res.headers.location))
            .set('Tus-Resumable', TUS_RESUMABLE)
            .end((err) => {
              if (err) {
                done(err)
              }
            })
        })
    })

    it('should fire when an upload is finished', (done) => {
      const length = Buffer.byteLength('test', 'utf8').toString()
      server.on(EVENTS.POST_FINISH, (req, res, upload) => {
        assert.ok(req)
        assert.ok(res)
        assert.equal(upload.offset, Number(length))
        done()
      })
      request(server.listen())
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', length)
        .then((res) => {
          request(server.listen())
            .patch(removeProtocol(res.headers.location))
            .send('test')
            .set('Tus-Resumable', TUS_RESUMABLE)
            .set('Upload-Offset', '0')
            .set('Content-Type', 'application/offset+octet-stream')
            .end((err) => {
              if (err) {
                done(err)
              }
            })
        })
    })

    it('should call onUploadCreate and return its error to the client', (done) => {
      const server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory: './test/output'}),
        async onUploadCreate() {
          throw {body: 'no', status_code: 500}
        },
      })
      request(server.listen())
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '4')
        .expect(500, 'no', done)
    })

    it('should call onUploadFinish and return its error to the client', (done) => {
      const server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory: './test/output'}),
        onUploadFinish() {
          throw {body: 'no', status_code: 500}
        },
      })
      request(server.listen())
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '4')
        .then((res) => {
          request(server.listen())
            .patch(removeProtocol(res.headers.location))
            .send('test')
            .set('Tus-Resumable', TUS_RESUMABLE)
            .set('Upload-Offset', '0')
            .set('Content-Type', 'application/offset+octet-stream')
            .expect(500, 'no', done)
        })
    })

    it('should call onUploadFinish and return its error to the client with creation-with-upload ', (done) => {
      const server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory: './test/output'}),
        async onUploadFinish() {
          throw {body: 'no', status_code: 500}
        },
      })
      request(server.listen())
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '4')
        .set('Upload-Offset', '0')
        .set('Content-Type', 'application/offset+octet-stream')
        .send('test')
        .expect(500, 'no', done)
    })

    it('should fire when an upload is finished with upload-defer-length', (done) => {
      const length = Buffer.byteLength('test', 'utf8').toString()
      server.on(EVENTS.POST_FINISH, (req, res, upload) => {
        assert.ok(req)
        assert.ok(res)
        assert.equal(upload.offset, Number(length))
        done()
      })
      request(server.listen())
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Defer-Length', '1')
        .then((res) => {
          request(server.listen())
            .patch(removeProtocol(res.headers.location))
            .set('Tus-Resumable', TUS_RESUMABLE)
            .set('Upload-Offset', '0')
            .set('Upload-Length', length)
            .set('Content-Type', 'application/offset+octet-stream')
            .send('test')
            .end((err) => {
              if (err) {
                done(err)
              }
            })
        })
    })
  })
})
