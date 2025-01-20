import 'should'

import {strict as assert} from 'node:assert'
import type http from 'node:http'

import httpMocks from 'node-mocks-http'

import {OptionsHandler} from '../src/handlers/OptionsHandler'
import {DataStore, ALLOWED_METHODS, ALLOWED_HEADERS, MAX_AGE} from '@tus/utils'
import {MemoryLocker, type ServerOptions} from '../src'

describe('OptionsHandler', () => {
  const options: ServerOptions = {
    path: '/test/output',
    locker: new MemoryLocker(),
    maxSize: 1024,
  }
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
      'Tus-Version': '1.0.0',
      'Tus-Max-Size': 1024,
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
