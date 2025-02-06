import 'should'

import {strict as assert} from 'node:assert'

import {OptionsHandler} from '../src/handlers/OptionsHandler'
import {
  DataStore,
  ALLOWED_METHODS,
  ALLOWED_HEADERS,
  MAX_AGE,
  type CancellationContext,
} from '@tus/utils'
import {MemoryLocker, type ServerOptions} from '../src'

describe('OptionsHandler', () => {
  const options: ServerOptions = {
    path: '/test/output',
    locker: new MemoryLocker(),
    maxSize: 1024,
  }
  const store = new DataStore()
  const handler = new OptionsHandler(store, options)

  let context: CancellationContext
  let req: Request

  beforeEach(() => {
    const abortController = new AbortController()
    context = {
      cancel: () => abortController.abort(),
      abort: () => abortController.abort(),
      signal: abortController.signal,
    }
    req = new Request(`https://example.com${options.path}/1234`, {method: 'OPTIONS'})
  })

  it('send() should set headers and 204', async () => {
    const headers = {
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Max-Age': MAX_AGE.toString(),
      'Tus-Version': '1.0.0',
      'Tus-Max-Size': '1024',
    }
    const res = await handler.send(req, context)
    for (const header in headers) {
      assert.equal(
        res.headers.get(header),
        headers[header as keyof typeof headers],
        `${header} not equal`
      )
    }

    assert.equal(res.status, 204)
  })

  it('send() should set extensions header if they exist', async () => {
    const headers = {'Tus-Extension': 'creation,expiration'}
    store.extensions = ['creation', 'expiration']
    const handler = new OptionsHandler(store, options)
    const res = await handler.send(req, context)
    // eslint-disable-next-line guard-for-in
    for (const header in headers) {
      assert.equal(res.headers.get(header), headers[header as keyof typeof headers])
    }
  })
})
