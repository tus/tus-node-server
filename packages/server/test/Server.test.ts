/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-throw-literal */
import 'should'

import {strict as assert} from 'node:assert'
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'

import request from 'supertest'
import Throttle from 'throttle'

import {Server} from '../src'
import {FileStore} from '@tus/file-store'
import {TUS_RESUMABLE, EVENTS, DataStore, Metadata} from '@tus/utils'
import httpMocks from 'node-mocks-http'
import sinon from 'sinon'

// Test server crashes on http://{some-ip} so we remove the protocol...
const removeProtocol = (location: string) => location.slice(6)
const directory = path.resolve(__dirname, 'output', 'server')

describe('Server', () => {
  before(async () => {
    await fs.mkdir(directory, {recursive: true})
  })
  after(async () => {
    await fs.rm(directory, {force: true, recursive: true})
  })

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
        datastore: new FileStore({directory}),
      })
      listener = server.listen()
    })

    after(async () => {
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

    it('OPTIONS should return returns custom headers in Access-Control-Allow-Headers', (done) => {
      server.options.allowedHeaders = ['Custom-Header']

      request(listener)
        .options('/')
        .expect(204, '', (err, res) => {
          res.headers.should.have.property('access-control-allow-headers')
          res.headers['access-control-allow-headers'].should.containEql('Custom-Header')
          server.options.allowedHeaders = []
          done(err)
        })
    })

    it('OPTIONS should return returns custom headers in Access-Control-Allow-Credentials', (done) => {
      server.options.allowedCredentials = true

      request(listener)
        .options('/')
        .expect(204, '', (err, res) => {
          res.headers.should.have.property('access-control-allow-credentials')
          res.headers['access-control-allow-credentials'].should.containEql('true')
          server.options.allowedCredentials = undefined
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
      const req = httpMocks.createRequest({
        headers: {'x-http-method-override': 'OPTIONS'},
        method: 'GET',
      })

      // @ts-expect-error todo
      const res = new http.ServerResponse({method: 'OPTIONS'})
      server.handle(req, res)
      assert.equal(req.method, 'OPTIONS')
      done()
    })

    it('should allow overriding the HTTP origin', async () => {
      const origin = 'vimeo.com'
      const req = httpMocks.createRequest({
        headers: {origin},
        method: 'OPTIONS',
        url: '/',
      })
      // @ts-expect-error todo
      const res = new http.ServerResponse({method: 'OPTIONS'})
      await server.handle(req, res)
      assert.equal(res.hasHeader('Access-Control-Allow-Origin'), true)
    })

    it('should allow overriding the HTTP origin only if match allowedOrigins', async () => {
      const origin = 'vimeo.com'
      server.options.allowedOrigins = ['vimeo.com']
      const req = httpMocks.createRequest({
        headers: {origin},
        method: 'OPTIONS',
        url: '/',
      })
      // @ts-expect-error todo
      const res = new http.ServerResponse({method: 'OPTIONS'})
      await server.handle(req, res)
      assert.equal(res.hasHeader('Access-Control-Allow-Origin'), true)
      assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'vimeo.com')
    })

    it('should allow overriding the HTTP origin only if match allowedOrigins with multiple allowed domains', async () => {
      const origin = 'vimeo.com'
      server.options.allowedOrigins = ['google.com', 'vimeo.com']
      const req = httpMocks.createRequest({
        headers: {origin},
        method: 'OPTIONS',
        url: '/',
      })
      // @ts-expect-error todo
      const res = new http.ServerResponse({method: 'OPTIONS'})
      await server.handle(req, res)
      assert.equal(res.hasHeader('Access-Control-Allow-Origin'), true)
      assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'vimeo.com')
    })

    it(`should now allow overriding the HTTP origin if doesn't match allowedOrigins`, async () => {
      const origin = 'vimeo.com'
      server.options.allowedOrigins = ['google.com']
      const req = httpMocks.createRequest({
        headers: {origin},
        method: 'OPTIONS',
        url: '/',
      })
      // @ts-expect-error todo
      const res = new http.ServerResponse({method: 'OPTIONS'})
      await server.handle(req, res)
      assert.equal(res.hasHeader('Access-Control-Allow-Origin'), true)
      assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'google.com')
    })

    it('should return Access-Control-Allow-Origin if no origin header', async () => {
      server.options.allowedOrigins = ['google.com']
      const req = httpMocks.createRequest({
        method: 'OPTIONS',
        url: '/',
      })
      // @ts-expect-error todo
      const res = new http.ServerResponse({method: 'OPTIONS'})
      await server.handle(req, res)
      assert.equal(res.hasHeader('Access-Control-Allow-Origin'), true)
      assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'google.com')
    })

    it('should not invoke handlers if onIncomingRequest throws', (done) => {
      const server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory}),
        async onIncomingRequest() {
          throw {status_code: 403, body: 'Access denied'}
        },
      })
      request(server.listen())
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '4')
        .set('Upload-Offset', '0')
        .set('Content-Type', 'application/offset+octet-stream')
        .send('test')
        .expect(403, 'Access denied', done)
    })

    it('can use namingFunction to create a nested directory structure', (done) => {
      const route = '/test/output'
      const server = new Server({
        path: route,
        datastore: new FileStore({directory}),
        namingFunction() {
          return 'foo/bar/id'
        },
        generateUrl(_, {proto, host, path, id}) {
          id = Buffer.from(id, 'utf-8').toString('base64url')
          return `${proto}://${host}${path}/${id}`
        },
        getFileIdFromRequest(req, lastPath) {
          if (!lastPath) {
            return
          }

          return Buffer.from(lastPath, 'base64url').toString('utf-8')
        },
      })
      const length = Buffer.byteLength('test', 'utf8').toString()
      const s = server.listen()
      request(s)
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', length)
        .then((res) => {
          request(s)
            .patch(removeProtocol(res.headers.location))
            .send('test')
            .set('Tus-Resumable', TUS_RESUMABLE)
            .set('Upload-Offset', '0')
            .set('Content-Type', 'application/offset+octet-stream')
            .expect(204, () => {
              s.close()
              done()
            })
        })
    })
  })

  describe('hooks', () => {
    let server: InstanceType<typeof Server>
    let listener: http.Server

    beforeEach(() => {
      server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory}),
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

    it('should receive throttled POST_RECEIVE event', (done) => {
      const server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory}),
        postReceiveInterval: 500,
      })
      const size = 1024 * 1024
      let received = 0
      server.on(EVENTS.POST_RECEIVE_V2, () => {
        received++
      })

      const originalWrite = server.datastore.write.bind(server.datastore)
      // Slow down writing
      sinon.stub(server.datastore, 'write').callsFake((stream, ...args) => {
        // bytes per second a bit slower than exactly 2s so we can test getting four events
        const throttleStream = new Throttle({bps: size / 2 - size / 10})
        return originalWrite(stream.pipe(throttleStream), ...args)
      })

      const data = Buffer.alloc(size, 'a')

      request(server.listen())
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', data.byteLength.toString())
        .then((res) => {
          request(server.listen())
            .patch(removeProtocol(res.headers.location))
            .send(data)
            .set('Tus-Resumable', TUS_RESUMABLE)
            .set('Upload-Offset', '0')
            .set('Content-Type', 'application/offset+octet-stream')
            .end((err) => {
              assert.ok(received >= 4, 'should have received 4 or more events')
              done(err)
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
        datastore: new FileStore({directory}),
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

    it('should allow metadata to be changed in onUploadCreate', (done) => {
      const filename = 'foo.txt'
      const server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory}),
        async onUploadCreate(_, res, upload) {
          const metadata = {...upload.metadata, filename}
          return {res, metadata}
        },
      })
      const s = server.listen()
      request(s)
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '4')
        .expect(201)
        .then((res) => {
          request(s)
            .head(removeProtocol(res.headers.location))
            .set('Tus-Resumable', TUS_RESUMABLE)
            .expect(200)
            .then((r) => {
              const metadata = Metadata.parse(r.headers['upload-metadata'])
              assert.equal(metadata.filename, filename)
              done()
            })
        })
    })

    it('should call onUploadFinish and return its error to the client', (done) => {
      const server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory}),
        onUploadFinish(_, __, upload) {
          assert.ok(upload.storage?.path, 'should have storage.path')
          assert.ok(upload.storage?.type, 'should have storage.type')
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
        datastore: new FileStore({directory}),
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

    it('should allow response to be changed in onUploadFinish', (done) => {
      const server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory}),
        async onUploadFinish(_, res) {
          return {
            res,
            status_code: 200,
            body: '{ fileProcessResult: 12 }',
            headers: {'X-TestHeader': '1'},
          }
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
            .expect(200, '{ fileProcessResult: 12 }')
            .then((r) => {
              assert.equal(r.headers['upload-offset'], '4')
              assert.equal(r.headers['x-testheader'], '1')
              done()
            })
        })
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

    it('should fire onResponseError hook when an error is thrown', async () => {
      const spy = sinon.spy()
      const server = new Server({
        path: '/test/output',
        datastore: new FileStore({directory}),
        onResponseError: () => {
          spy()
          return {status_code: 404, body: 'custom-error'}
        },
        onUploadFinish() {
          throw {body: 'no', status_code: 500}
        },
      })

      await request(server.listen())
        .post(server.options.path)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', '4')
        .set('Upload-Offset', '0')
        .set('Content-Type', 'application/offset+octet-stream')
        .send('test')
        .expect(404, 'custom-error')

      assert.equal(spy.calledOnce, true)
    })
  })
})
