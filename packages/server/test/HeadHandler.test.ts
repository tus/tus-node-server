import {strict as assert} from 'node:assert'
import type http from 'node:http'

import sinon from 'sinon'
import httpMocks from 'node-mocks-http'

import {ERRORS, DataStore, Upload, type CancellationContext} from '@tus/utils'
import {HeadHandler} from '../src/handlers/HeadHandler'
import {MemoryLocker} from '../src'

describe('HeadHandler', () => {
  const path = '/test/output'
  const fake_store = sinon.createStubInstance(DataStore)
  const handler = new HeadHandler(fake_store, {
    relativeLocation: true,
    path,
    locker: new MemoryLocker(),
  })
  let req: http.IncomingMessage
  let res: httpMocks.MockResponse<http.ServerResponse>
  let context: CancellationContext

  beforeEach(() => {
    req = {url: `${path}/1234`, method: 'HEAD'} as http.IncomingMessage
    res = httpMocks.createResponse({req})
    const abortController = new AbortController()
    context = {
      cancel: () => abortController.abort(),
      abort: () => abortController.abort(),
      signal: abortController.signal,
    }
  })

  it('should 404 if no file id match', () => {
    fake_store.getUpload.rejects(ERRORS.FILE_NOT_FOUND)
    return assert.rejects(() => handler.send(req, res, context), {status_code: 404})
  })

  it('should 404 if no file ID', () => {
    req.url = `${path}/`
    return assert.rejects(() => handler.send(req, res, context), {status_code: 404})
  })

  it('should resolve with the offset and cache-control', async () => {
    fake_store.getUpload.resolves(new Upload({id: '1234', offset: 0}))
    await handler.send(req, res, context)
    assert.equal(res.getHeader('Upload-Offset'), 0)
    assert.equal(res.getHeader('Cache-Control'), 'no-store')
    assert.equal(res.statusCode, 200)
  })

  it('should resolve with upload-length', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
      size: 512,
    })
    fake_store.getUpload.resolves(file)
    await handler.send(req, res, context)
    assert.equal(res.getHeader('Upload-Length'), file.size)
    assert.equal(res.hasHeader('Upload-Defer-Length'), false)
  })

  it('should resolve with upload-defer-length', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
    })
    fake_store.getUpload.resolves(file)
    await handler.send(req, res, context)
    assert.equal(res.getHeader('Upload-Defer-Length'), '1')
    assert.equal(res.hasHeader('Upload-Length'), false)
  })

  it('should resolve with metadata', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
      metadata: {is_confidential: null, foo: 'bar'},
    })
    fake_store.getUpload.resolves(file)
    await handler.send(req, res, context)
    assert.equal(res.getHeader('Upload-Metadata'), 'is_confidential,foo YmFy')
  })

  it('should resolve without metadata', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
    })
    fake_store.getUpload.resolves(file)
    await handler.send(req, res, context)
    assert.equal(res.hasHeader('Upload-Metadata'), false)
  })
})
