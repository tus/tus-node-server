import { strict as assert } from 'node:assert'
import * as httpMocks from 'node-mocks-http'

import BaseHandler from '../lib/handlers/BaseHandler'
import DataStore from '../lib/stores/DataStore'

describe('BaseHandler', () => {
  it('constructor must require a DataStore', (done: any) => {
    assert.throws(() => {
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 0.
      const handler = new BaseHandler()
    }, Error)
    done()
  })
  let res: any = null
  // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
  const store = new DataStore({ path: '/test/output' })
  // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
  const handler = new BaseHandler(store)
  beforeEach((done: any) => {
    const METHOD = 'GET'
    // @ts-expect-error TS(2345): Argument of type '{ method: string; }' is not assi... Remove this comment to see the full error message
    res = httpMocks.createResponse({ method: METHOD })
    done()
  })
  it('write() should end the response', (done: any) => {
    handler.write(res, 200, {})
    assert.equal(res.finished, true)
    done()
  })
  it('write() should set a response code', (done: any) => {
    handler.write(res, 201, {})
    assert.equal(res.statusCode, 201)
    done()
  })
  it('write() should set headers', (done: any) => {
    const headers = {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    }
    handler.write(res, 200, headers)
    for (const header of Object.keys(headers)) {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      assert.equal(res.getHeader(header), headers[header])
    }
    done()
  })
  it('write() should write the body', (done: any) => {
    const body = 'Hello tus!'
    handler.write(res, 200, {}, body)
    const output = res._getData()
    assert.equal(output.match(/Hello tus!$/).index, output.length - body.length)
    done()
  })
})
