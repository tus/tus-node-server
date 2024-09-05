/* eslint-disable max-nested-callbacks */
import 'should'

import {strict as assert} from 'node:assert'
import type http from 'node:http'

import httpMocks from 'node-mocks-http'
import sinon from 'sinon'

import {EVENTS, Upload, DataStore, type CancellationContext} from '@tus/utils'
import {PostHandler} from '../src/handlers/PostHandler'
import {addPipableStreamBody} from './utils'
import {MemoryLocker} from '../src'

const SERVER_OPTIONS = {
  path: '/test',
  namingFunction: () => '1234',
  locker: new MemoryLocker(),
}

describe('PostHandler', () => {
  let req: http.IncomingMessage
  let res: httpMocks.MockResponse<http.ServerResponse>
  let context: CancellationContext

  const fake_store = sinon.createStubInstance(DataStore)
  fake_store.hasExtension.withArgs('creation-defer-length').returns(true)

  beforeEach(() => {
    req = addPipableStreamBody(httpMocks.createRequest({method: 'POST'}))
    res = httpMocks.createResponse({req})
    const abortController = new AbortController()
    context = {
      cancel: () => abortController.abort(),
      abort: () => abortController.abort(),
      signal: abortController.signal,
    }
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
        return assert.rejects(() => handler.send(req, res, context), {
          status_code: 400,
        })
      })

      it('must 400 if the Upload-Length and Upload-Defer-Length headers are both present', async () => {
        const handler = new PostHandler(fake_store, SERVER_OPTIONS)
        req.headers = {'upload-length': '512', 'upload-defer-length': '1'}
        return assert.rejects(() => handler.send(req, res, context), {
          status_code: 400,
        })
      })

      it("must 501 if the 'concatenation' extension is not supported", async () => {
        const handler = new PostHandler(fake_store, SERVER_OPTIONS)
        req.headers = {'upload-concat': 'partial'}
        return assert.rejects(() => handler.send(req, res, context), {
          status_code: 501,
        })
      })

      it('should send error when naming function throws', async () => {
        const fake_store = sinon.createStubInstance(DataStore)
        const handler = new PostHandler(fake_store, {
          path: '/test',
          locker: new MemoryLocker(),
          namingFunction: () => {
            throw {status_code: 400}
          },
        })

        req.headers = {'upload-length': '1000'}
        return assert.rejects(() => handler.send(req, res, context), {
          status_code: 400,
        })
      })

      it('should call custom namingFunction', async () => {
        const fake_store = sinon.createStubInstance(DataStore)
        const namingFunction = sinon.stub().returns('1234')
        const handler = new PostHandler(fake_store, {
          path: '/test/',
          namingFunction,
          locker: new MemoryLocker(),
        })

        req.headers = {'upload-length': '1000'}
        await handler.send(req, res, context)
        assert.equal(namingFunction.calledOnce, true)
      })

      it('should call custom async namingFunction', async () => {
        const fake_store = sinon.createStubInstance(DataStore)
        const namingFunction = sinon.stub().resolves('1234')
        const handler = new PostHandler(fake_store, {
          path: '/test/',
          namingFunction,
          locker: new MemoryLocker(),
        })

        req.headers = {'upload-length': '1000'}
        await handler.send(req, res, context)
        assert.equal(namingFunction.calledOnce, true)
      })

      it('should send error when store rejects', () => {
        const fake_store = sinon.createStubInstance(DataStore)
        fake_store.create.rejects({status_code: 500})

        const handler = new PostHandler(fake_store, SERVER_OPTIONS)

        req.headers = {'upload-length': '1000'}
        return assert.rejects(() => handler.send(req, res, context), {
          status_code: 500,
        })
      })
    })

    describe('test successful scenarios', () => {
      it('must acknowledge successful POST requests with the 201', async () => {
        const handler = new PostHandler(fake_store, {
          path: '/test/output',
          locker: new MemoryLocker(),
          namingFunction: () => '1234',
        })
        req.headers = {'upload-length': '1000', host: 'localhost:3000'}
        await handler.send(req, res, context)
        assert.equal(res._getHeaders().location, 'http://localhost:3000/test/output/1234')
        assert.equal(res.statusCode, 201)
      })
    })

    describe('respect forwarded headers', () => {
      const handler = new PostHandler(fake_store, {
        path: '/test/output',
        locker: new MemoryLocker(),
        respectForwardedHeaders: true,
        namingFunction: () => '1234',
      })

      it('should handle X-Forwarded-Host with X-Forwarded-Proto', async () => {
        req.headers = {
          'upload-length': '1000',
          host: 'localhost:3000',
          'x-forwarded-host': 'foo.com',
          'x-forwarded-proto': 'https',
        }
        await handler.send(req, res, context)
        assert.equal(res._getHeaders().location, 'https://foo.com/test/output/1234')
        assert.equal(res.statusCode, 201)
      })

      it('should handle Forwarded', async () => {
        req.headers = {
          'upload-length': '1000',
          host: 'localhost:3000',
          forwarded: 'for=localhost:3000;by=203.0.113.60;proto=https;host=foo.com',
        }
        await handler.send(req, res, context)
        assert.equal(res._getHeaders().location, 'https://foo.com/test/output/1234')
        assert.equal(res.statusCode, 201)
      })

      it('should fallback on invalid Forwarded', async () => {
        req.headers = {
          'upload-length': '1000',
          host: 'localhost:3000',
          forwarded: 'invalid',
        }
        await handler.send(req, res, context)
        assert.equal(res._getHeaders().location, 'http://localhost:3000/test/output/1234')
        assert.equal(res.statusCode, 201)
      })

      it('should fallback on invalid X-Forwarded headers', async () => {
        req.headers = {
          'upload-length': '1000',
          host: 'localhost:3000',
          'x-forwarded-proto': 'foo',
        }
        await handler.send(req, res, context)
        assert.equal(res._getHeaders().location, 'http://localhost:3000/test/output/1234')
        assert.equal(res.statusCode, 201)
      })

      it('should handle root as path', async () => {
        const handler = new PostHandler(fake_store, {
          path: '/',
          locker: new MemoryLocker(),
          respectForwardedHeaders: true,
          namingFunction: () => '1234',
        })
        req.headers = {'upload-length': '1000', host: 'localhost:3000'}
        await handler.send(req, res, context)
        assert.equal(res._getHeaders().location, 'http://localhost:3000/1234')
        assert.equal(res.statusCode, 201)
      })
    })

    describe('events', () => {
      it(`must fire the ${EVENTS.POST_CREATE} event`, async () => {
        const store = sinon.createStubInstance(DataStore)
        const file = new Upload({id: '1234', size: 1024, offset: 0})
        const handler = new PostHandler(store, SERVER_OPTIONS)
        const spy = sinon.spy()

        req.headers = {'upload-length': '1024'}
        store.create.resolves(file)
        handler.on(EVENTS.POST_CREATE, spy)

        await handler.send(req, res, context)
        assert.equal(spy.calledOnce, true)
      })

      it(`must fire the ${EVENTS.POST_CREATE} event with absolute URL`, (done) => {
        const fake_store = sinon.createStubInstance(DataStore)

        const file = new Upload({id: '1234', size: 10, offset: 0})
        fake_store.create.resolves(file)

        const handler = new PostHandler(fake_store, {
          path: '/test/output',
          locker: new MemoryLocker(),
          namingFunction: () => '1234',
        })
        handler.on(EVENTS.POST_CREATE, (_, __, ___, url) => {
          assert.strictEqual(url, 'http://localhost:3000/test/output/1234')
          done()
        })

        req.headers = {'upload-length': '1000', host: 'localhost:3000'}
        handler.send(req, res, context)
      })

      it(`must fire the ${EVENTS.POST_CREATE} event with relative URL`, (done) => {
        const fake_store = sinon.createStubInstance(DataStore)

        const file = new Upload({id: '1234', size: 10, offset: 0})
        fake_store.create.resolves(file)

        const handler = new PostHandler(fake_store, {
          path: '/test/output',
          locker: new MemoryLocker(),
          relativeLocation: true,
          namingFunction: () => '1234',
        })
        handler.on(EVENTS.POST_CREATE, (_, __, ___, url) => {
          assert.strictEqual(url, '/test/output/1234')
          done()
        })

        req.headers = {'upload-length': '1000', host: 'localhost:3000'}
        handler.send(req, res, context)
      })

      it(`must fire the ${EVENTS.POST_CREATE} event when upload is complete with single request`, (done) => {
        const fake_store = sinon.createStubInstance(DataStore)

        const upload_length = 1000

        fake_store.create.resolvesArg(0)
        fake_store.write.resolves(upload_length)

        const handler = new PostHandler(fake_store, {
          path: '/test/output',
          locker: new MemoryLocker(),
        })
        handler.on(EVENTS.POST_CREATE, () => {
          done()
        })

        req.headers = {
          'upload-length': `${upload_length}`,
          host: 'localhost:3000',
          'content-type': 'application/offset+octet-stream',
        }
        handler.send(req, res, context)
      })

      it('should call onUploadCreate hook', async () => {
        const store = sinon.createStubInstance(DataStore)
        const spy = sinon.stub().resolvesArg(1)
        const handler = new PostHandler(store, {
          path: '/test/output',
          locker: new MemoryLocker(),
          onUploadCreate: spy,
        })

        req.headers = {
          'upload-length': '1024',
          host: 'localhost:3000',
        }
        store.create.resolvesArg(0)

        await handler.send(req, res, context)
        assert.equal(spy.calledOnce, true)
        const upload = spy.args[0][2]
        assert.equal(upload.offset, 0)
        assert.equal(upload.size, 1024)
      })

      it('should call onUploadFinish hook when creation-with-upload is used', async () => {
        const store = sinon.createStubInstance(DataStore)
        const spy = sinon.stub().resolvesArg(1)
        const handler = new PostHandler(store, {
          path: '/test/output',
          locker: new MemoryLocker(),
          onUploadFinish: spy,
        })

        req.headers = {
          'upload-length': '1024',
          host: 'localhost:3000',
          'content-type': 'application/offset+octet-stream',
        }
        store.create.resolvesArg(0)
        store.write.resolves(1024)

        await handler.send(req, res, context)
        assert.equal(spy.calledOnce, true)
        const upload = spy.args[0][2]
        assert.equal(upload.offset, 1024)
        assert.equal(upload.size, 1024)
      })

      it('should call onUploadFinish hook for empty file without content-type', async () => {
        const store = sinon.createStubInstance(DataStore)
        const spy = sinon.stub().resolvesArg(1)
        const handler = new PostHandler(store, {
          path: '/test/output',
          locker: new MemoryLocker(),
          onUploadFinish: spy,
        })

        req.headers = {'upload-length': '0', host: 'localhost:3000'}

        await handler.send(req, res, context)
        assert.equal(spy.calledOnce, true)
        const upload = spy.args[0][2]
        assert.equal(upload.offset, 0)
        assert.equal(upload.size, 0)
      })

      it('does not set Location header if onUploadFinish hook returned a not eligible status code', async () => {
        const store = sinon.createStubInstance(DataStore)
        const handler = new PostHandler(store, {
          path: '/test/output',
          locker: new MemoryLocker(),
          onUploadFinish: async (req, res) => ({res, status_code: 200}),
        })

        req.headers = {
          'upload-length': '0',
          host: 'localhost:3000',
        }
        store.create.resolvesArg(0)

        await handler.send(req, res, context)
        assert.equal('location' in res._getHeaders(), false)
      })
    })
  })
})
