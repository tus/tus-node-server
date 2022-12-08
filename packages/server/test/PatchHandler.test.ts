import 'should'

import {strict as assert} from 'node:assert'
import http from 'node:http'

import sinon from 'sinon'
import httpMocks from 'node-mocks-http'

import {PatchHandler} from '../src/handlers/PatchHandler'
import {Upload, DataStore} from '../src/models'
import {EVENTS} from '../src/constants'

describe('PatchHandler', () => {
  const path = '/test/output'
  let req: http.IncomingMessage
  let res: httpMocks.MockResponse<http.ServerResponse>
  let store: sinon.SinonStubbedInstance<DataStore>
  let handler: InstanceType<typeof PatchHandler>

  beforeEach(() => {
    store = sinon.createStubInstance(DataStore)
    handler = new PatchHandler(store, {path})
    req = {method: 'PATCH', url: `${path}/1234`} as http.IncomingMessage
    res = httpMocks.createResponse({req})
  })

  it('should 403 if no Content-Type header', () => {
    req.headers = {}
    return assert.rejects(() => handler.send(req, res), {status_code: 403})
  })

  it('should 403 if no Upload-Offset header', () => {
    req.headers = {'content-type': 'application/offset+octet-stream'}
    return assert.rejects(() => handler.send(req, res), {status_code: 403})
  })

  it('should call onUploadFinished hook', async function () {
    const spy = sinon.stub().resolvesArg(1)
    const handler = new PatchHandler(store, {
      path: '/test/output',
      onUploadFinish: spy,
    })

    req.headers = {
      'upload-offset': '0',
      'content-type': 'application/offset+octet-stream',
    }
    store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 1024}))
    store.write.resolves(1024)

    await handler.send(req, res)
    assert.equal(spy.calledOnce, true)
    const upload = spy.args[0][2]
    assert.equal(upload.offset, 1024)
    assert.equal(upload.size, 1024)
  })

  describe('send()', () => {
    it('should 404 urls without a path', () => {
      req.url = `${path}/`
      return assert.rejects(() => handler.send(req, res), {status_code: 404})
    })

    it('should 403 if the offset is omitted', () => {
      req.headers = {
        'content-type': 'application/offset+octet-stream',
      }
      req.url = `${path}/file`
      return assert.rejects(() => handler.send(req, res), {status_code: 403})
    })

    it('should 403 the content-type is omitted', () => {
      req.headers = {'upload-offset': '0'}
      req.url = `${path}/file`
      return assert.rejects(() => handler.send(req, res), {status_code: 403})
    })

    it('should declare upload-length once it is send', async () => {
      req.headers = {
        'upload-offset': '0',
        'upload-length': '10',
        'content-type': 'application/offset+octet-stream',
      }
      req.url = `${path}/file`

      store.hasExtension.withArgs('creation-defer-length').returns(true)
      store.getUpload.resolves(new Upload({id: '1234', offset: 0}))
      store.write.resolves(5)
      store.declareUploadLength.resolves()

      await handler.send(req, res)

      assert.equal(store.declareUploadLength.calledOnceWith('file', 10), true)
    })

    it('should 400 if upload-length is already set', () => {
      req.headers = {
        'upload-offset': '0',
        'upload-length': '10',
        'content-type': 'application/offset+octet-stream',
      }
      req.url = `${path}/file`

      store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 20}))
      store.hasExtension.withArgs('creation-defer-length').returns(true)

      return assert.rejects(() => handler.send(req, res), {status_code: 400})
    })

    it('must return a promise if the headers validate', () => {
      req.headers = {
        'upload-offset': '0',
        'upload-length': '512',
        'content-type': 'application/offset+octet-stream',
      }
      req.url = `${path}/1234`
      // eslint-disable-next-line new-cap
      handler.send(req, res).should.be.a.Promise()
    })

    it('must 409 if the offset does not match', () => {
      req.headers = {
        'upload-offset': '10',
        'upload-length': '512',
        'content-type': 'application/offset+octet-stream',
      }

      store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 512}))

      return assert.rejects(() => handler.send(req, res), {status_code: 409})
    })

    it('must acknowledge successful PATCH requests with the 204', async () => {
      req.headers = {
        'upload-offset': '0',
        'content-type': 'application/offset+octet-stream',
      }

      store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 1024}))
      store.write.resolves(10)

      await handler.send(req, res)

      assert.equal(res._getHeaders()['upload-offset'], 10)
      assert.equal(res.hasHeader('Content-Length'), false)
      assert.equal(res.statusCode, 204)
    })
  })

  it('should emit POST_RECEIVE event', async () => {
    const spy = sinon.spy()
    req.headers = {
      'upload-offset': '0',
      'content-type': 'application/offset+octet-stream',
    }

    store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 1024}))
    store.write.resolves(10)
    handler.on(EVENTS.POST_RECEIVE, spy)

    await handler.send(req, res)

    assert.equal(spy.calledOnce, true)
    assert.ok(spy.args[0][0])
    assert.ok(spy.args[0][1])
    assert.equal(spy.args[0][2].offset, 10)
  })
})
