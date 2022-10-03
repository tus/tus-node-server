import 'should'

import assert from 'node:assert/strict'
import http from 'node:http'

import sinon from 'sinon'

import DataStore from '../lib/stores/DataStore'
import PostHandler from '../lib/handlers/PostHandler'
import { EVENTS } from '../lib/constants'

const hasHeader = (res: any, header: any) => {
  const key = Object.keys(header)[0]
  return res._header.indexOf(`${key}: ${header[key]}`) > -1
}

describe('PostHandler', () => {
  let req: {
    headers: Record<string, string | number>
    url?: string
    host?: string
  } = { headers: {} }
  // @ts-expect-error
  let res: http.ServerResponse<http.IncomingMessage> = new http.ServerResponse({
    method: 'POST',
  })
  const fake_store = sinon.createStubInstance(DataStore)

  beforeEach((done: any) => {
    req = { headers: {}, url: '/files', host: 'localhost:3000' }
    // @ts-expect-error
    res = new http.ServerResponse({ method: 'POST' })
    done()
  })

  describe('constructor()', () => {
    it('must check for naming function', () => {
      assert.throws(() => {
        // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
        new PostHandler(fake_store)
      }, Error)
      assert.doesNotThrow(() => {
        new PostHandler(fake_store, { namingFunction: () => '1234' })
      })
    })
  })

  describe('send()', () => {
    describe('test errors', () => {
      it('must 400 if the Upload-Length and Upload-Defer-Length headers are both missing', async () => {
        const handler = new PostHandler(fake_store, {
          namingFunction: () => '1234',
        })
        req.headers = {}
        return assert.rejects(() => handler.send(req, res), {
          status_code: 400,
        })
      })

      it('must 400 if the Upload-Length and Upload-Defer-Length headers are both present', async () => {
        const handler = new PostHandler(fake_store, {
          namingFunction: () => '1234',
        })
        req.headers = { 'upload-length': '512', 'upload-defer-length': '1' }
        return assert.rejects(() => handler.send(req, res), {
          status_code: 400,
        })
      })

      it("must 501 if the 'concatenation' extension is not supported", async () => {
        const handler = new PostHandler(fake_store, {
          namingFunction: () => '1234',
        })
        req.headers = { 'upload-concat': 'partial' }
        return assert.rejects(() => handler.send(req, res), {
          status_code: 501,
        })
      })

      it('should send error when naming function throws', async () => {
        const fake_store = sinon.createStubInstance(DataStore)
        const handler = new PostHandler(fake_store, {
          namingFunction: sinon.stub().throws(),
        })
        req.headers = { 'upload-length': 1000 }
        return assert.rejects(() => handler.send(req, res), {
          status_code: 500,
        })
      })

      it('should call custom namingFunction', async () => {
        const fake_store = sinon.createStubInstance(DataStore)
        const namingFunction = sinon.stub().returns('1234')
        const handler = new PostHandler(fake_store, { namingFunction })
        req.headers = { 'upload-length': 1000 }
        await handler.send(req, res)
        assert.equal(namingFunction.calledOnce, true)
      })

      it('should send error when store rejects', () => {
        const fake_store = sinon.createStubInstance(DataStore)
        fake_store.create.rejects({ status_code: 500 })
        const handler = new PostHandler(fake_store, {
          namingFunction: () => '1234',
        })
        req.headers = { 'upload-length': 1000 }
        return assert.rejects(() => handler.send(req, res), {
          status_code: 500,
        })
      })
    })

    describe('test successful scenarios', () => {
      it('must acknowledge successful POST requests with the 201', async () => {
        const handler = new PostHandler(fake_store, {
          path: '/test/output',
          namingFunction: () => '1234',
        })
        req.headers = { 'upload-length': 1000, host: 'localhost:3000' }
        await handler.send(req, res)
        assert.equal(
          hasHeader(res, { Location: '//localhost:3000/test/output/1234' }),
          true
        )
        assert.equal(res.statusCode, 201)
      })
    })

    describe('events', () => {
      it(`must fire the ${EVENTS.EVENT_FILE_CREATED} event`, (done: any) => {
        const fake_store = sinon.createStubInstance(DataStore)
        const file = {}
        fake_store.create.resolves(file)
        const handler = new PostHandler(fake_store, {
          namingFunction: () => '1234',
        })
        ;(handler as any).on(EVENTS.EVENT_FILE_CREATED, (obj: any) => {
          assert.strictEqual(obj.file, file)
          done()
        })
        req.headers = { 'upload-length': 1000 }
        handler.send(req, res)
      })

      it(`must fire the ${EVENTS.EVENT_ENDPOINT_CREATED} event with absolute URL`, (done: any) => {
        const fake_store = sinon.createStubInstance(DataStore)
        const file = {}
        fake_store.create.resolves(file)
        const handler = new PostHandler(fake_store, {
          path: '/test/output',
          namingFunction: () => '1234',
        })
        ;(handler as any).on(EVENTS.EVENT_ENDPOINT_CREATED, (obj: any) => {
          assert.strictEqual(obj.url, '//localhost:3000/test/output/1234')
          done()
        })
        req.headers = { 'upload-length': 1000, host: 'localhost:3000' }
        handler.send(req, res)
      })

      it(`must fire the ${EVENTS.EVENT_ENDPOINT_CREATED} event with relative URL`, (done: any) => {
        const fake_store = sinon.createStubInstance(DataStore)
        const file = {}
        fake_store.create.resolves(file)
        const handler = new PostHandler(fake_store, {
          path: '/test/output',
          relativeLocation: true,
          namingFunction: () => '1234',
        })
        ;(handler as any).on(EVENTS.EVENT_ENDPOINT_CREATED, (obj: any) => {
          assert.strictEqual(obj.url, '/test/output/1234')
          done()
        })
        req.headers = { 'upload-length': 1000, host: 'localhost:3000' }
        handler.send(req, res)
      })
    })
  })
})
