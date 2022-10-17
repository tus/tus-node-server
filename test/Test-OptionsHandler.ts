import 'should'

import {strict as assert} from 'node:assert'
import http from 'node:http'
import net from 'node:net'

import OptionsHandler from '../lib/handlers/OptionsHandler'
import DataStore from '../lib/stores/DataStore'
import {ALLOWED_METHODS, ALLOWED_HEADERS, MAX_AGE} from '../lib/constants'

describe('OptionsHandler', () => {
  const options = {path: '/test/output'}
  const store = new DataStore()
  const handler = new OptionsHandler(store, options)

  let req: http.IncomingMessage
  let res: http.ServerResponse

  beforeEach(() => {
    req = new http.IncomingMessage(new net.Socket())
    req.url = handler.generateUrl(req, '1234')
    req.method = 'OPTIONS'
    res = new http.ServerResponse(req)
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
