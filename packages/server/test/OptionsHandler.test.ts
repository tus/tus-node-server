import 'should'

import {strict as assert} from 'node:assert'
import http from 'node:http'

import httpMocks from 'node-mocks-http'

import {OptionsHandler} from '../src/handlers/OptionsHandler'
import {DataStore} from '../src/models/DataStore'
import {ALLOWED_METHODS, ALLOWED_HEADERS, MAX_AGE} from '../src/constants'

describe('OptionsHandler', () => {
  const options = {path: '/test/output'}
  const store = new DataStore()
  const handler = new OptionsHandler(store, options)

  let req: http.IncomingMessage
  let res: httpMocks.MockResponse<http.ServerResponse>

  beforeEach(() => {
    req = {url: `${options.path}/1234`, method: 'OPTIONS'} as http.IncomingMessage
    res = httpMocks.createResponse({req})
  })

  it('send() should set headers and 204', async () => {
    const headers = {
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Max-Age': MAX_AGE,
    }
    await handler.send(req, res)
    // eslint-disable-next-line guard-for-in
    for (const header in headers) {
      assert.equal(res.getHeader(header), headers[header as keyof typeof headers])
    }

    assert.equal(res.statusCode, 204)
  })

  it('send() should set extensions header if they exist', async () => {
    const headers = {'Tus-Extension': 'creation,expiration'}
    store.extensions = ['creation', 'expiration']
    const handler = new OptionsHandler(store, options)
    await handler.send(req, res)
    // eslint-disable-next-line guard-for-in
    for (const header in headers) {
      assert.equal(res.getHeader(header), headers[header as keyof typeof headers])
    }
  })
})
