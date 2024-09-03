import {strict as assert} from 'node:assert'
import type http from 'node:http'

import httpMocks from 'node-mocks-http'

import {BaseHandler} from '../src/handlers/BaseHandler'
import {DataStore} from '@tus/utils'
import {MemoryLocker} from '../src'

describe('BaseHandler', () => {
  const store = new DataStore()
  const handler = new BaseHandler(store, {
    path: '/test/output',
    locker: new MemoryLocker(),
  })
  let res: httpMocks.MockResponse<http.ServerResponse>

  beforeEach(() => {
    res = httpMocks.createResponse()
  })

  it('constructor must require a DataStore', (done) => {
    assert.throws(() => {
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 0.
      new BaseHandler()
    }, Error)
    done()
  })

  it('write() should end the response', (done) => {
    handler.write(res, 200, {})
    assert.equal(res.finished, true)
    done()
  })

  it('write() should set a response code', (done) => {
    handler.write(res, 201, {})
    assert.equal(res.statusCode, 201)
    done()
  })

  it('write() should set headers', (done) => {
    const header = 'Access-Control-Allow-Methods'
    const headers = {[header]: 'GET, OPTIONS'}
    handler.write(res, 200, headers)
    assert.equal(res.getHeader(header), headers[header])

    done()
  })

  it('write() should write the body', (done) => {
    const body = 'Hello tus!'
    handler.write(res, 200, {}, body)
    const output = res._getData()
    assert.equal(output.match(/Hello tus!$/).index, output.length - body.length)
    done()
  })

  it('should get ID correctly from nested URL', () => {
    const req = {url: '/some/path/yeah/1234'} as http.IncomingMessage
    const id = handler.getFileIdFromRequest(req)

    assert.equal(id, '1234')
  })

  it('should handle URL-encoded ID', () => {
    const req = {url: '/some/path/yeah/1234%205%23'} as http.IncomingMessage
    const id = handler.getFileIdFromRequest(req)

    assert.equal(id, '1234 5#')
  })

  it('should allow to to generate a url with a custom function', () => {
    const handler = new BaseHandler(store, {
      path: '/path',
      locker: new MemoryLocker(),
      generateUrl: (_, info) => {
        const {proto, host, path, id} = info
        return `${proto}://${host}${path}/${id}?customParam=1`
      },
    })

    const req = httpMocks.createRequest({
      headers: {
        host: 'localhost',
      },
    })
    const id = '123'
    const url = handler.generateUrl(req, id)
    assert.equal(url, 'http://localhost/path/123?customParam=1')
  })

  it('should allow extracting the request id with a custom function', () => {
    const handler = new BaseHandler(store, {
      path: '/path',
      locker: new MemoryLocker(),
      getFileIdFromRequest: (req: http.IncomingMessage) => {
        return `${req.url?.split('/').pop()}-custom`
      },
    })

    const req = httpMocks.createRequest({
      url: '/upload/1234',
    })
    const url = handler.getFileIdFromRequest(req)
    assert.equal(url, '1234-custom')
  })
})
