/* eslint-disable max-nested-callbacks */
import 'should'

import {strict as assert} from 'node:assert'
import http from 'node:http'
import net from 'node:net'

import sinon from 'sinon'

import DataStore from '../lib/stores/DataStore'
import PostHandler from '../lib/handlers/PostHandler'
import {EVENTS} from '../lib/constants'
import File from '../lib/models/File'

const SERVER_OPTIONS = {
  path: '/test',
  namingFunction: () => '1234',
}

describe('PostHandler', () => {
  let req: http.IncomingMessage
  let res: http.ServerResponse

  const fake_store = sinon.createStubInstance(DataStore)
  fake_store.hasExtension.withArgs('creation-defer-length').returns(true)

  beforeEach(() => {
    req = new http.IncomingMessage(new net.Socket())
    req.method = 'POST'
    req.url = '/files'
    res = new http.ServerResponse(req)
  })

  describe('constructor()', () => {
    it('must check for naming function', () => {
      assert.throws(() => {
        // @ts-expect-error expected
        new PostHandler(fake_store)
      }, Error)
      assert.doesNotThrow(() => {
        new PostHandler(fake_store, SERVER_OPTIONS)
      })
    })
  })

  describe('send()', () => {
    describe('test errors', () => {
      it('must 400 if the Upload-Length and Upload-Defer-Length headers are both missing', async () => {
        const handler = new PostHandler(fake_store, SERVER_OPTIONS)

        req.headers = {}
        return assert.rejects(() => handler.send(req, res), {status_code: 400})
      })

      it('must 400 if the Upload-Length and Upload-Defer-Length headers are both present', async () => {
        const handler = new PostHandler(fake_store, SERVER_OPTIONS)
        req.headers = {'upload-length': '512', 'upload-defer-length': '1'}
        return assert.rejects(() => handler.send(req, res), {status_code: 400})
      })

      it("must 501 if the 'concatenation' extension is not supported", async () => {
        const handler = new PostHandler(fake_store, SERVER_OPTIONS)
        req.headers = {'upload-concat': 'partial'}
        return assert.rejects(() => handler.send(req, res), {status_code: 501})
      })

      it('should send error when naming function throws', async () => {
        const fake_store = sinon.createStubInstance(DataStore)
        const handler = new PostHandler(fake_store, {
          path: '/test',
          namingFunction: sinon.stub().throws(),
        })

        req.headers = {'upload-length': '1000'}
        return assert.rejects(() => handler.send(req, res), {status_code: 500})
      })

      it('should call custom namingFunction', async () => {
        const fake_store = sinon.createStubInstance(DataStore)
        const namingFunction = sinon.stub().returns('1234')
        const handler = new PostHandler(fake_store, {path: '/test/', namingFunction})

        req.headers = {'upload-length': '1000'}
        await handler.send(req, res)
        assert.equal(namingFunction.calledOnce, true)
      })

      it('should send error when store rejects', () => {
        const fake_store = sinon.createStubInstance(DataStore)
        fake_store.create.rejects({status_code: 500})

        const handler = new PostHandler(fake_store, SERVER_OPTIONS)

        req.headers = {'upload-length': '1000'}
        return assert.rejects(() => handler.send(req, res), {status_code: 500})
      })
    })

    describe('test successful scenarios', () => {
      it('must acknowledge successful POST requests with the 201', async () => {
        const handler = new PostHandler(fake_store, {
          path: '/test/output',
          namingFunction: () => '1234',
        })
        req.headers = {'upload-length': '1000', host: 'localhost:3000'}
        await handler.send(req, res)
        assert.equal(
          // @ts-expect-error works but not in types
          res._header.includes('Location: http://localhost:3000/test/output/1234'),
          true
        )
        assert.equal(res.statusCode, 201)
      })
    })

    describe('respect forwarded headers', () => {
      const handler = new PostHandler(fake_store, {
        path: '/test/output',
        respectForwardedHeaders: true,
        namingFunction: () => '1234',
      })

      it('should handle X-Forwarded-Host with X-Forwarded-Proto', async () => {
        req.headers = {
          'upload-length': '1000',
          host: 'localhost:3000',
          'X-Forwarded-Host': 'foo.com',
          'X-Forwarded-Proto': 'https',
        }
        await handler.send(req, res)
        assert.equal(
          // @ts-expect-error works but not in types
          res._header.includes('Location: https://foo.com/test/output/1234'),
          true
        )
        assert.equal(res.statusCode, 201)
      })

      it('should handle Forwarded', async () => {
        req.headers = {
          'upload-length': '1000',
          host: 'localhost:3000',
          Forwarded: 'for=localhost:3000;by=203.0.113.60;proto=https;host=foo.com',
        }
        await handler.send(req, res)
        assert.equal(
          // @ts-expect-error works but not in types
          res._header.includes('Location: https://foo.com/test/output/1234'),
          true
        )
        assert.equal(res.statusCode, 201)
      })

      it('should fallback on invalid Forwarded', async () => {
        req.headers = {
          'upload-length': '1000',
          host: 'localhost:3000',
          Forwarded: 'invalid',
        }
        await handler.send(req, res)
        assert.equal(
          // @ts-expect-error works but not in types
          res._header.includes('Location: http://localhost:3000/test/output/1234'),
          true
        )
        assert.equal(res.statusCode, 201)
      })

      it('should fallback on invalid X-Forwarded headers', async () => {
        req.headers = {
          'upload-length': '1000',
          host: 'localhost:3000',
          'X-Forwarded-Proto': 'foo',
        }
        await handler.send(req, res)
        assert.equal(
          // @ts-expect-error works but not in types
          res._header.includes('Location: http://localhost:3000/test/output/1234'),
          true
        )
        assert.equal(res.statusCode, 201)
      })

      it('should handle root as path', async () => {
        const handler = new PostHandler(fake_store, {
          path: '/',
          respectForwardedHeaders: true,
          namingFunction: () => '1234',
        })
        req.headers = {'upload-length': '1000', host: 'localhost:3000'}
        await handler.send(req, res)
        assert.equal(
          // @ts-expect-error works but not in types
          res._header.includes('Location: http://localhost:3000/1234'),
          true
        )
        assert.equal(res.statusCode, 201)
      })
    })

    describe('events', () => {
      it(`must fire the ${EVENTS.EVENT_FILE_CREATED} event`, (done) => {
        const fake_store = sinon.createStubInstance(DataStore)

        const file = new File('1234', '10')
        fake_store.create.resolves(file)

        const handler = new PostHandler(fake_store, SERVER_OPTIONS)
        handler.on(EVENTS.EVENT_FILE_CREATED, (obj) => {
          assert.strictEqual(obj.file, file)
          done()
        })

        req.headers = {'upload-length': '1000'}
        handler.send(req, res)
      })

      it(`must fire the ${EVENTS.EVENT_ENDPOINT_CREATED} event with absolute URL`, (done) => {
        const fake_store = sinon.createStubInstance(DataStore)

        const file = new File('1234', '10')
        fake_store.create.resolves(file)

        const handler = new PostHandler(fake_store, {
          path: '/test/output',
          namingFunction: () => '1234',
        })
        handler.on(EVENTS.EVENT_ENDPOINT_CREATED, (obj) => {
          assert.strictEqual(obj.url, 'http://localhost:3000/test/output/1234')
          done()
        })

        req.headers = {'upload-length': '1000', host: 'localhost:3000'}
        handler.send(req, res)
      })

      it(`must fire the ${EVENTS.EVENT_ENDPOINT_CREATED} event with relative URL`, (done) => {
        const fake_store = sinon.createStubInstance(DataStore)

        const file = new File('1234', '10')
        fake_store.create.resolves(file)

        const handler = new PostHandler(fake_store, {
          path: '/test/output',
          relativeLocation: true,
          namingFunction: () => '1234',
        })
        handler.on(EVENTS.EVENT_ENDPOINT_CREATED, (obj) => {
          assert.strictEqual(obj.url, '/test/output/1234')
          done()
        })

        req.headers = {'upload-length': '1000', host: 'localhost:3000'}
        handler.send(req, res)
      })

      it(`must fire the ${EVENTS.EVENT_UPLOAD_COMPLETE} event when upload is complete with single request`, (done) => {
        const fake_store = sinon.createStubInstance(DataStore)

        const upload_length = 1000

        fake_store.create.resolvesArg(0)
        fake_store.write.resolves(upload_length)

        const handler = new PostHandler(fake_store, {path: '/test/output'})
        handler.on(EVENTS.EVENT_UPLOAD_COMPLETE, () => {
          done()
        })

        req.headers = {
          'upload-length': `${upload_length}`,
          host: 'localhost:3000',
          'content-type': 'application/offset+octet-stream',
        }
        handler.send(req, res)
      })

      it(`must not fire the ${EVENTS.EVENT_UPLOAD_COMPLETE} event when upload-length is defered`, (done) => {
        const fake_store = sinon.createStubInstance(DataStore)

        const upload_length = 1000

        fake_store.create.resolvesArg(0)
        fake_store.write.resolves(upload_length)
        fake_store.hasExtension.withArgs('creation-defer-length').returns(true)

        const handler = new PostHandler(fake_store, {path: '/test/output'})
        handler.on(EVENTS.EVENT_UPLOAD_COMPLETE, () => {
          done(new Error('test'))
        })

        req.headers = {
          'upload-defer-length': '1',
          host: 'localhost:3000',
          'content-type': 'application/offset+octet-stream',
        }
        handler
          .send(req, res)
          .then(() => done())
          .catch(done)
      })
    })
  })
})
