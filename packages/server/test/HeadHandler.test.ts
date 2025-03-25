import {strict as assert} from 'node:assert'

import sinon from 'sinon'

import {ERRORS, DataStore, Upload, type CancellationContext} from '@tus/utils'
import {HeadHandler} from '../src/handlers/HeadHandler'
import {MemoryLocker} from '../src'

describe('HeadHandler', () => {
  const path = '/test/output'
  const url = `https://example.com${path}`
  const fake_store = sinon.createStubInstance(DataStore)
  const handler = new HeadHandler(fake_store, {
    relativeLocation: true,
    path,
    locker: new MemoryLocker(),
  })
  let req: Request
  let context: CancellationContext

  beforeEach(() => {
    req = new Request(`${url}/1234`, {
      method: 'HEAD',
    })
    const abortController = new AbortController()
    context = {
      cancel: () => abortController.abort(),
      abort: () => abortController.abort(),
      signal: abortController.signal,
    }
  })

  it('should 404 if no file id match', () => {
    fake_store.getUpload.rejects(ERRORS.FILE_NOT_FOUND)
    return assert.rejects(() => handler.send(req, context), {status_code: 404})
  })

  it('should 404 if no file ID', () => {
    req = new Request(`${url}/`, {
      method: 'HEAD',
    })
    return assert.rejects(() => handler.send(req, context), {status_code: 404})
  })

  it('should resolve with the offset and cache-control', async () => {
    fake_store.getUpload.resolves(new Upload({id: '1234', offset: 0}))
    const res = await handler.send(req, context)
    assert.equal(res.headers.get('Upload-Offset'), '0')
    assert.equal(res.headers.get('Cache-Control'), 'no-store')
    assert.equal(res.status, 200)
  })

  it('should resolve with upload-length', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
      size: 512,
    })
    fake_store.getUpload.resolves(file)
    const res = await handler.send(req, context)
    assert.equal(res.headers.get('Upload-Length'), '512')
    assert.equal(res.headers.has('Upload-Defer-Length'), false)
  })

  it('should resolve with upload-defer-length', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
    })
    fake_store.getUpload.resolves(file)
    const res = await handler.send(req, context)
    assert.equal(res.headers.get('Upload-Defer-Length'), '1')
    assert.equal(res.headers.has('Upload-Length'), false)
  })

  it('should resolve with metadata', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
      metadata: {is_confidential: null, foo: 'bar'},
    })
    fake_store.getUpload.resolves(file)
    const res = await handler.send(req, context)
    assert.equal(res.headers.get('Upload-Metadata'), 'is_confidential,foo YmFy')
  })

  it('should resolve without metadata', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
    })
    fake_store.getUpload.resolves(file)
    const res = await handler.send(req, context)
    assert.equal(res.headers.has('Upload-Metadata'), false)
  })
})
