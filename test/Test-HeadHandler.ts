import {strict as assert} from 'node:assert'
import http from 'node:http'
import net from 'node:net'

import sinon from 'sinon'

import DataStore from '../lib/stores/DataStore'
import HeadHandler from '../lib/handlers/HeadHandler'
import {ERRORS} from '../lib/constants'

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
    fake_store.getOffset.rejects(ERRORS.FILE_NOT_FOUND)
    return assert.rejects(() => handler.send(req, res), {status_code: 404})
  })

  it('should 404 if no file ID', () => {
    req.url = `${path}/`
    return assert.rejects(() => handler.send(req, res), {status_code: 404})
  })

  it('should resolve with the offset and cache-control', async () => {
    fake_store.getOffset.resolves({id: '1234', size: 0, upload_length: '1'})
    await handler.send(req, res)
    assert.equal(res.getHeader('Upload-Offset'), '0')
    assert.equal(res.getHeader('Cache-Control'), 'no-store')
    assert.equal(res.statusCode, 200)
  })

  it('should resolve with upload-length', async () => {
    const file = {
      id: '1234',
      size: 0,
      upload_length: '1',
      upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential',
    }
    fake_store.getOffset.resolves(file)
    await handler.send(req, res)
    assert.equal(res.getHeader('Upload-Length'), file.upload_length)
    assert.equal(res.hasHeader('Upload-Defer-Length'), false)
  })

  it('should resolve with upload-defer-length', async () => {
    const file = {
      id: '1234',
      size: 0,
      upload_defer_length: '1',
      upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential',
    }
    fake_store.getOffset.resolves(file)
    await handler.send(req, res)
    assert.equal(res.getHeader('Upload-Defer-Length'), file.upload_defer_length)
    assert.equal(res.hasHeader('Upload-Length'), false)
  })

  it('should resolve with metadata', async () => {
    const file = {
      id: '1234',
      size: 0,
      upload_length: '1',
      upload_metadata: 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential',
    }
    fake_store.getOffset.resolves(file)
    await handler.send(req, res)
    assert.equal(res.getHeader('Upload-Metadata'), file.upload_metadata)
  })

  it('should resolve without metadata', async () => {
    const file = {id: '1234', size: 0, upload_length: '1'}
    fake_store.getOffset.resolves(file)
    await handler.send(req, res)
    assert.equal(res.hasHeader('Upload-Metadata'), false)
  })
})
