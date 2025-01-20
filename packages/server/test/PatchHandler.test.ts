import 'should'

import {strict as assert} from 'node:assert'
import type http from 'node:http'

import sinon from 'sinon'
import httpMocks from 'node-mocks-http'

import {PatchHandler} from '../src/handlers/PatchHandler'
import {EVENTS, Upload, DataStore, type CancellationContext} from '@tus/utils'
import {EventEmitter} from 'node:events'
import {addPipableStreamBody} from './utils'
import {MemoryLocker} from '../src'
import streamP from 'node:stream/promises'
import stream, {PassThrough} from 'node:stream'

describe('PatchHandler', () => {
  const path = '/test/output'
  let req: http.IncomingMessage
  let res: httpMocks.MockResponse<http.ServerResponse>
  let store: sinon.SinonStubbedInstance<DataStore>
  let handler: InstanceType<typeof PatchHandler>
  let context: CancellationContext

  beforeEach(() => {
    store = sinon.createStubInstance(DataStore)
    handler = new PatchHandler(store, {path, locker: new MemoryLocker()})
    req = addPipableStreamBody(
      httpMocks.createRequest({
        method: 'PATCH',
        url: `${path}/1234`,
        eventEmitter: EventEmitter,
      })
    )
    res = httpMocks.createResponse({req})
    const abortController = new AbortController()
    context = {
      cancel: () => abortController.abort(),
      abort: () => abortController.abort(),
      signal: abortController.signal,
    }
  })

  it('should 403 if no Content-Type header', () => {
    req.headers = {}
    return assert.rejects(() => handler.send(req, res, context), {status_code: 403})
  })

  it('should 403 if no Upload-Offset header', () => {
    req.headers = {'content-type': 'application/offset+octet-stream'}
    return assert.rejects(() => handler.send(req, res, context), {status_code: 403})
  })

  it('should call onUploadFinished hook', async () => {
    const spy = sinon.stub().resolvesArg(1)
    const handler = new PatchHandler(store, {
      path: '/test/output',
      onUploadFinish: spy,
      locker: new MemoryLocker(),
    })

    req.headers = {
      'upload-offset': '0',
      'content-type': 'application/offset+octet-stream',
    }
    store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 1024}))
    store.write.resolves(1024)

    await handler.send(req, res, context)
    assert.equal(spy.calledOnce, true)
    const upload = spy.args[0][2]
    assert.equal(upload.offset, 1024)
    assert.equal(upload.size, 1024)
  })

  describe('send()', () => {
    it('should 404 urls without a path', () => {
      req.url = `${path}/`
      return assert.rejects(() => handler.send(req, res, context), {status_code: 404})
    })

    it('should 403 if the offset is omitted', () => {
      req.headers = {
        'content-type': 'application/offset+octet-stream',
      }
      req.url = `${path}/file`
      return assert.rejects(() => handler.send(req, res, context), {status_code: 403})
    })

    it('should 403 the content-type is omitted', () => {
      req.headers = {'upload-offset': '0'}
      req.url = `${path}/file`
      return assert.rejects(() => handler.send(req, res, context), {status_code: 403})
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

      await handler.send(req, res, context)

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

      return assert.rejects(() => handler.send(req, res, context), {status_code: 400})
    })

    it('must return a promise if the headers validate', () => {
      req.headers = {
        'upload-offset': '0',
        'upload-length': '512',
        'content-type': 'application/offset+octet-stream',
      }
      req.url = `${path}/1234`
      // eslint-disable-next-line new-cap
      handler.send(req, res, context).should.be.a.Promise()
    })

    it('must 409 if the offset does not match', () => {
      req.headers = {
        'upload-offset': '10',
        'upload-length': '512',
        'content-type': 'application/offset+octet-stream',
      }

      store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 512}))

      return assert.rejects(() => handler.send(req, res, context), {status_code: 409})
    })

    it('must acknowledge successful PATCH requests with the 204', async () => {
      req.headers = {
        'upload-offset': '0',
        'content-type': 'application/offset+octet-stream',
      }

      store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 1024}))
      store.write.resolves(10)

      await handler.send(req, res, context)

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

    await handler.send(req, res, context)

    assert.equal(spy.calledOnce, true)
    assert.ok(spy.args[0][0])
    assert.ok(spy.args[0][1])
    assert.equal(spy.args[0][2].offset, 10)
  })

  it('should throw max size exceeded error when upload-length is higher then the maxSize', async () => {
    handler = new PatchHandler(store, {path, maxSize: 5, locker: new MemoryLocker()})
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

    try {
      await handler.send(req, res, context)
      throw new Error('failed test')
    } catch (e) {
      assert.equal('body' in e, true)
      assert.equal('status_code' in e, true)
      assert.equal(e.body, 'Maximum size exceeded\n')
      assert.equal(e.status_code, 413)
    }
  })

  it('should throw max size exceeded error when the request body is bigger then the maxSize', async () => {
    handler = new PatchHandler(store, {path, maxSize: 5, locker: new MemoryLocker()})
    const req = addPipableStreamBody(
      httpMocks.createRequest({
        method: 'PATCH',
        url: `${path}/1234`,
        body: Buffer.alloc(30),
      })
    )
    const res = httpMocks.createResponse({req})
    req.headers = {
      'upload-offset': '0',
      'content-type': 'application/offset+octet-stream',
    }
    req.url = `${path}/file`

    store.getUpload.resolves(new Upload({id: '1234', offset: 0}))
    store.write.callsFake(async (readable: http.IncomingMessage | stream.Readable) => {
      const writeStream = new stream.PassThrough()
      await streamP.pipeline(readable, writeStream)
      return writeStream.readableLength
    })
    store.declareUploadLength.resolves()

    try {
      await handler.send(req, res, context)
      throw new Error('failed test')
    } catch (e) {
      assert.equal(e.message !== 'failed test', true, 'failed test')
      assert.equal('body' in e, true)
      assert.equal('status_code' in e, true)
      assert.equal(e.body, 'Maximum size exceeded\n')
      assert.equal(e.status_code, 413)
      assert.equal(context.signal.aborted, true)
    }
  })

  it('should gracefully terminate request stream when context is cancelled', async () => {
    handler = new PatchHandler(store, {path, locker: new MemoryLocker()})

    const bodyStream = new PassThrough() // 20kb buffer
    const req = addPipableStreamBody(
      httpMocks.createRequest({
        method: 'PATCH',
        url: `${path}/1234`,
        body: bodyStream,
      })
    )

    const abortController = new AbortController()
    context = {
      cancel: () => abortController.abort(),
      abort: () => abortController.abort(),
      signal: abortController.signal,
    }

    const res = httpMocks.createResponse({req})
    req.headers = {
      'upload-offset': '0',
      'content-type': 'application/offset+octet-stream',
    }
    req.url = `${path}/file`

    let accumulatedBuffer: Buffer = Buffer.alloc(0)

    store.getUpload.resolves(new Upload({id: '1234', offset: 0}))
    store.write.callsFake(async (readable: http.IncomingMessage | stream.Readable) => {
      const writeStream = new stream.PassThrough()
      const chunks: Buffer[] = []

      writeStream.on('data', (chunk) => {
        chunks.push(chunk) // Accumulate chunks in the outer buffer
      })

      await streamP.pipeline(readable, writeStream)

      accumulatedBuffer = Buffer.concat([accumulatedBuffer, ...chunks])

      return writeStream.readableLength
    })
    store.declareUploadLength.resolves()

    await new Promise((resolve, reject) => {
      handler.send(req, res, context).then(resolve).catch(reject)

      // sends the first 20kb
      bodyStream.write(Buffer.alloc(1024 * 20))

      // write 15kb
      bodyStream.write(Buffer.alloc(1024 * 15))

      // simulate that the request was cancelled
      setTimeout(() => {
        context.abort()
      }, 200)
    })

    // We expect that all the data was written to the store, 35kb
    assert.equal(accumulatedBuffer.byteLength, 35 * 1024)
    bodyStream.end()
  })
})
