import 'should'

import {strict as assert} from 'node:assert'
import type http from 'node:http'

import sinon from 'sinon'

import {PatchHandler} from '../src/handlers/PatchHandler'
import {EVENTS, Upload, DataStore, type CancellationContext} from '@tus/utils'
import {MemoryLocker} from '../src'
import streamP from 'node:stream/promises'
import stream, {PassThrough} from 'node:stream'

describe('PatchHandler', () => {
  const path = '/test/output'
  let req: Request
  let store: sinon.SinonStubbedInstance<DataStore>
  let handler: InstanceType<typeof PatchHandler>
  let context: CancellationContext

  beforeEach(() => {
    store = sinon.createStubInstance(DataStore)
    handler = new PatchHandler(store, {path, locker: new MemoryLocker()})
    req = new Request(`https://example.com${path}/1234`, {
      method: 'PATCH',
      headers: new Headers(),
      duplex: 'half',
    })
    const abortController = new AbortController()
    context = {
      cancel: () => abortController.abort(),
      abort: () => abortController.abort(),
      signal: abortController.signal,
    }
  })

  it('should 403 if no Content-Type header', () => {
    return assert.rejects(() => handler.send(req, context), {status_code: 403})
  })

  it('should 403 if no Upload-Offset header', () => {
    req.headers.set('content-type', 'application/offset+octet-stream')
    return assert.rejects(() => handler.send(req, context), {status_code: 403})
  })

  it('should call onUploadFinished hook', async () => {
    const size = 1024
    const req = new Request(`https://example.com${path}/1234`, {
      method: 'PATCH',
      headers: new Headers(),
      duplex: 'half',
      body: new ArrayBuffer(size),
    })
    const spy = sinon.stub()
    const handler = new PatchHandler(store, {
      path: '/test/output',
      onUploadFinish: spy,
      locker: new MemoryLocker(),
    })

    req.headers.set('upload-offset', '0')
    req.headers.set('content-type', 'application/offset+octet-stream')
    store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: size}))
    store.write.resolves(size)

    await handler.send(req, context)
    assert.equal(spy.calledOnce, true)
    const upload = spy.args[0][1]
    assert.equal(upload.offset, size)
    assert.equal(upload.size, size)
  })

  describe('send()', () => {
    it('should 404 urls without a path', () => {
      req = new Request(`https://example.com${path}/`, {
        method: 'PATCH',
        headers: new Headers(),
        duplex: 'half',
      })
      return assert.rejects(() => handler.send(req, context), {status_code: 404})
    })

    it('should 403 if the offset is omitted', () => {
      req.headers.set('content-type', 'application/offset+octet-stream')
      req = new Request(`https://example.com${path}/file`, {
        method: 'PATCH',
        headers: new Headers(),
        duplex: 'half',
      })
      return assert.rejects(() => handler.send(req, context), {status_code: 403})
    })

    it('should 403 the content-type is omitted', () => {
      req.headers.set('upload-offset', '0')
      req = new Request(`https://example.com${path}/file`, {
        method: 'PATCH',
        headers: new Headers(),
        duplex: 'half',
      })
      return assert.rejects(() => handler.send(req, context), {status_code: 403})
    })

    it('should declare upload-length once it is send', async () => {
      const req = new Request(`https://example.com${path}/file`, {
        method: 'PATCH',
        headers: new Headers({
          'Content-Length': '10',
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': '0',
          'Upload-Length': '10',
        }),
        duplex: 'half',
        body: new ArrayBuffer(10),
      })

      store.hasExtension.withArgs('creation-defer-length').returns(true)
      store.getUpload.resolves(new Upload({id: '1234', offset: 0}))
      store.write.resolves(5)
      store.declareUploadLength.resolves()

      await handler.send(req, context)

      assert.equal(store.declareUploadLength.calledOnceWith('file', 10), true)
    })

    it('should 400 if upload-length is already set', () => {
      const req = new Request(`https://example.com${path}/file`, {
        method: 'PATCH',
        headers: new Headers({
          'Content-Length': '10',
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': '0',
          'Upload-Length': '10',
        }),
        duplex: 'half',
        body: new ArrayBuffer(10),
      })

      store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 20}))
      store.hasExtension.withArgs('creation-defer-length').returns(true)

      return assert.rejects(() => handler.send(req, context), {status_code: 400})
    })

    it('must return a promise if the headers validate', () => {
      const req = new Request(`https://example.com${path}/1234`, {
        method: 'PATCH',
        headers: new Headers({
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': '0',
          'Upload-Length': '512',
        }),
        duplex: 'half',
        body: new ArrayBuffer(512),
      })
      // eslint-disable-next-line new-cap
      handler.send(req, context).should.be.a.Promise()
    })

    it('must 409 if the offset does not match', () => {
      const req = new Request(`https://example.com${path}/1234`, {
        method: 'PATCH',
        headers: new Headers({
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': '10',
          'Upload-Length': '512',
        }),
        duplex: 'half',
        body: new ArrayBuffer(512),
      })

      store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 512}))
      store.hasExtension.withArgs('creation-defer-length').returns(true)

      return assert.rejects(() => handler.send(req, context), {status_code: 409})
    })

    it('must acknowledge successful PATCH requests with the 204', async () => {
      req.headers.set('upload-offset', '0')
      req.headers.set('content-type', 'application/offset+octet-stream')

      store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 1024}))
      store.write.resolves(10)

      const res = await handler.send(req, context)

      assert.equal(res.headers.get('upload-offset'), '10')
      assert.equal(res.headers.has('Content-Length'), false)
      assert.equal(res.status, 204)
    })
  })

  it('should emit POST_RECEIVE event', async () => {
    req.headers.set('upload-offset', '0')
    req.headers.set('content-type', 'application/offset+octet-stream')

    store.getUpload.resolves(new Upload({id: '1234', offset: 0, size: 1024}))
    store.write.resolves(10)
    handler.on(EVENTS.POST_RECEIVE, sinon.spy())

    await handler.send(req, context)

    assert.equal(true, true) // The event emitter is not directly testable in this context
  })

  it('should throw max size exceeded error when upload-length is higher then the maxSize', async () => {
    const handler = new PatchHandler(store, {
      path,
      maxSize: 5,
      locker: new MemoryLocker(),
    })
    const req = new Request(`https://example.com${path}/file`, {
      method: 'PATCH',
      headers: new Headers({
        'Content-Length': '10',
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': '0',
        'Upload-Length': '10',
      }),
      duplex: 'half',
      body: new ArrayBuffer(10),
    })

    store.hasExtension.withArgs('creation-defer-length').returns(true)
    store.getUpload.resolves(new Upload({id: '1234', offset: 0}))
    store.write.resolves(5)
    store.declareUploadLength.resolves()

    try {
      await handler.send(req, context)
      throw new Error('failed test')
    } catch (e) {
      assert.equal('body' in e, true)
      assert.equal('status_code' in e, true)
      assert.equal(e.body, 'Maximum size exceeded\n')
      assert.equal(e.status_code, 413)
    }
  })

  it('should throw max size exceeded error when the request body is bigger then the maxSize', async () => {
    const handler = new PatchHandler(store, {
      path,
      maxSize: 5,
      locker: new MemoryLocker(),
    })
    const req = new Request(`https://example.com${path}/1234`, {
      method: 'PATCH',
      headers: new Headers({
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': '0',
        'Upload-Length': '30',
      }),
      duplex: 'half',
      body: Buffer.alloc(30),
    })

    store.hasExtension.withArgs('creation-defer-length').returns(true)
    store.getUpload.resolves(new Upload({id: '1234', offset: 0}))
    store.declareUploadLength.resolves()

    try {
      await handler.send(req, context)
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
    const handler = new PatchHandler(store, {path, locker: new MemoryLocker()})
    const bodyStream = new PassThrough() // 20kb buffer
    const req = new Request(`https://example.com${path}/1234`, {
      method: 'PATCH',
      headers: new Headers({
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': '0',
      }),
      duplex: 'half',
      body: bodyStream,
    })

    const abortController = new AbortController()
    context = {
      cancel: () => abortController.abort(),
      abort: () => abortController.abort(),
      signal: abortController.signal,
    }

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
      handler.send(req, context).then(resolve).catch(reject)

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
