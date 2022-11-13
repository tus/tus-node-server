import {strict as assert} from 'node:assert'
import http from 'node:http'
import net from 'node:net'

import sinon from 'sinon'

import DataStore from '../lib/stores/DataStore'
import HeadHandler from '../lib/handlers/HeadHandler'
import {ERRORS} from '../lib/constants'
import Upload from '../lib/models/Upload'

describe('HeadHandler', () => {
  const path = '/test/output'
  const fake_store = sinon.createStubInstance(DataStore)
  const handler = new HeadHandler(fake_store, {relativeLocation: true, path})
  let req: http.IncomingMessage
  let res: http.ServerResponse

  beforeEach(() => {
    req = new http.IncomingMessage(new net.Socket())
    req.url = handler.generateUrl(req, '1234')
    req.method = 'HEAD'
    res = new http.ServerResponse(req)
  })

  it('should 404 if no file id match', () => {
    fake_store.getUpload.rejects(ERRORS.FILE_NOT_FOUND)
    return assert.rejects(() => handler.send(req, res), {status_code: 404})
  })

  it('should 404 if no file ID', () => {
    req.url = `${path}/`
    return assert.rejects(() => handler.send(req, res), {status_code: 404})
  })

  it('should resolve with the offset and cache-control', async () => {
    fake_store.getUpload.resolves(new Upload({id: '1234', offset: 0}))
    await handler.send(req, res)
    assert.equal(res.getHeader('Upload-Offset'), 0)
    assert.equal(res.getHeader('Cache-Control'), 'no-store')
    assert.equal(res.statusCode, 200)
  })

  it('should resolve with upload-length', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
      size: 512,
      metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential',
    })
    fake_store.getUpload.resolves(file)
    await handler.send(req, res)
    assert.equal(res.getHeader('Upload-Length'), file.size)
    assert.equal(res.hasHeader('Upload-Defer-Length'), false)
  })

  it('should resolve with upload-defer-length', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
      metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential',
    })
    fake_store.getUpload.resolves(file)
    await handler.send(req, res)
    assert.equal(res.getHeader('Upload-Defer-Length'), '1')
    assert.equal(res.hasHeader('Upload-Length'), false)
  })

  it('should resolve with metadata', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
      metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential',
    })
    fake_store.getUpload.resolves(file)
    await handler.send(req, res)
    assert.equal(res.getHeader('Upload-Metadata'), file.metadata)
  })

  it('should resolve without metadata', async () => {
    const file = new Upload({
      id: '1234',
      offset: 0,
    })
    fake_store.getUpload.resolves(file)
    await handler.send(req, res)
    assert.equal(res.hasHeader('Upload-Metadata'), false)
  })
})
