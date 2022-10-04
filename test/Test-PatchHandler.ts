import 'should'

import {strict as assert} from 'node:assert'
import http from 'node:http'

import sinon from 'sinon'
import PatchHandler from '../lib/handlers/PatchHandler'
import DataStore from '../lib/stores/DataStore'

const hasHeader = (res: any, header: any) => {
  if (typeof header === 'string') {
    return res._header.includes(`${header}:`)
  }

  const key = Object.keys(header)[0]
  return res._header.includes(`${key}: ${header[key]}`)
}

describe('PatchHandler', () => {
  const path = '/test/output'
  let res: any = null
  let store: any = null
  let handler: any = null
  const req = {headers: {}}

  beforeEach((done) => {
    store = sinon.createStubInstance(DataStore)

    handler = new PatchHandler(store, {path})
    // @ts-expect-error todo
    res = new http.ServerResponse({method: 'PATCH'})
    done()
  })

  it('should 403 if no Content-Type header', () => {
    req.headers = {}
    // @ts-expect-error todo
    req.url = `${path}/1234`
    return assert.rejects(() => handler.send(req, res), {status_code: 403})
  })

  it('should 403 if no Upload-Offset header', () => {
    req.headers = {'content-type': 'application/offset+octet-stream'}
    // @ts-expect-error todo
    req.url = `${path}/1234`
    return assert.rejects(() => handler.send(req, res), {status_code: 403})
  })

  describe('send()', () => {
    it('should 404 urls without a path', () => {
      // @ts-expect-error todo
      req.url = `${path}/`
      return assert.rejects(() => handler.send(req, res), {status_code: 404})
    })

    it('should 403 if the offset is omitted', () => {
      req.headers = {
        'content-type': 'application/offset+octet-stream',
      }
      // @ts-expect-error todo
      req.url = `${path}/file`
      return assert.rejects(() => handler.send(req, res), {status_code: 403})
    })

    it('should 403 the content-type is omitted', () => {
      req.headers = {
        'upload-offset': '0',
      }
      // @ts-expect-error todo
      req.url = `${path}/file`
      return assert.rejects(() => handler.send(req, res), {status_code: 403})
    })

    it('should declare upload-length once it is send', async () => {
      req.headers = {
        'upload-offset': '0',
        'upload-length': '10',
        'content-type': 'application/offset+octet-stream',
      }
      // @ts-expect-error todo
      req.url = `${path}/file`

      store.hasExtension.withArgs('creation-defer-length').returns(true)
      store.getOffset.resolves({size: 0, upload_defer_length: '1'})
      store.write.resolves(5)
      store.declareUploadLength.resolves()

      await handler.send(req, res)

      assert.equal(store.declareUploadLength.calledOnceWith('file', '10'), true)
    })

    it('should 400 if upload-length is already set', () => {
      req.headers = {
        'upload-offset': '0',
        'upload-length': '10',
        'content-type': 'application/offset+octet-stream',
      }
      // @ts-expect-error todo
      req.url = `${path}/file`

      store.getOffset.resolves({size: 0, upload_length: '20'})
      store.hasExtension.withArgs('creation-defer-length').returns(true)

      return assert.rejects(() => handler.send(req, res), {status_code: 400})
    })

    it('must return a promise if the headers validate', () => {
      req.headers = {
        'upload-offset': '0',
        'upload-length': '512',
        'content-type': 'application/offset+octet-stream',
      }
      // @ts-expect-error todo
      req.url = `${path}/1234`
      handler.send(req, res).should.be.a.Promise()
    })

    it('must 409 if the offset does not match', () => {
      req.headers = {
        'upload-offset': '10',
        'upload-length': '512',
        'content-type': 'application/offset+octet-stream',
      }
      // @ts-expect-error todo
      req.url = `${path}/1234`

      store.getOffset.resolves({size: 0, upload_length: '512'})

      return assert.rejects(() => handler.send(req, res), {status_code: 409})
    })

    it('must acknowledge successful PATCH requests with the 204', async () => {
      req.headers = {
        'upload-offset': '0',
        'content-type': 'application/offset+octet-stream',
      }
      // @ts-expect-error todo
      req.url = `${path}/1234`

      store.getOffset.resolves({size: 0, upload_length: '1024'})
      store.write.resolves(10)

      await handler.send(req, res)

      assert.equal(hasHeader(res, {'Upload-Offset': '10'}), true)
      assert.equal(hasHeader(res, 'Content-Length'), false)
      assert.equal(res.statusCode, 204)
    })
  })
})
