import {strict as assert} from 'node:assert'

import {BaseHandler} from '../src/handlers/BaseHandler'
import {DataStore} from '@tus/utils'
import {MemoryLocker} from '../src'

describe('BaseHandler', () => {
  const store = new DataStore()
  const handler = new BaseHandler(store, {
    path: '/test/output',
    locker: new MemoryLocker(),
  })

  it('constructor must require a DataStore', (done) => {
    assert.throws(() => {
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 0.
      new BaseHandler()
    }, Error)
    done()
  })

  it('write() should end the response and set status code', (done) => {
    const res = handler.write(200, {})
    assert.equal(res.status, 200)
    done()
  })

  it('write() should set headers', (done) => {
    const header = 'Access-Control-Allow-Methods'
    const headers = {[header]: 'GET, OPTIONS'}
    const res = handler.write(200, headers)
    assert.equal(res.headers.get(header), headers[header])
    done()
  })

  it('write() should write the body', async () => {
    const body = 'Hello tus!'
    const res = handler.write(200, {}, body)
    assert.equal(await res.text(), body)
  })

  it('should get ID correctly from nested URL', () => {
    const req = new Request('https://example.com/some/path/yeah/1234')
    const id = handler.getFileIdFromRequest(req)
    assert.equal(id, '1234')
  })

  it('should handle URL-encoded ID', () => {
    const req = new Request('https://example.com/some/path/yeah/1234%205%23')
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

    const req = new Request('http://example.com/upload/123', {
      headers: {
        host: 'example.com',
      },
    })
    const id = '123'
    const url = handler.generateUrl(req, id)
    assert.equal(url, 'http://example.com/path/123?customParam=1')
  })

  it('should allow extracting the request id with a custom function', () => {
    const handler = new BaseHandler(store, {
      path: '/path',
      locker: new MemoryLocker(),
      getFileIdFromRequest: (req: Request) => {
        return `${new URL(req.url).pathname.split('/').pop()}-custom`
      },
    })

    const req = new Request('http://example.com/upload/1234')
    const url = handler.getFileIdFromRequest(req)
    assert.equal(url, '1234-custom')
  })
})
