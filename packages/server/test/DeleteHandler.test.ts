import 'should'

import {strict as assert} from 'node:assert'
import type http from 'node:http'

import sinon from 'sinon'
import httpMocks from 'node-mocks-http'

import {ERRORS, EVENTS, DataStore, type CancellationContext} from '@tus/utils'
import {DeleteHandler} from '../src/handlers/DeleteHandler'
import {MemoryLocker} from '../src'

describe('DeleteHandler', () => {
  const path = '/test/output'
  const fake_store = sinon.createStubInstance(DataStore)
  let handler: InstanceType<typeof DeleteHandler>
  let req: http.IncomingMessage
  let res: httpMocks.MockResponse<http.ServerResponse>
  let context: CancellationContext

  beforeEach(() => {
    fake_store.remove.resetHistory()
    handler = new DeleteHandler(fake_store, {
      relativeLocation: true,
      path,
      locker: new MemoryLocker(),
    })
    req = {url: `${path}/1234`, method: 'DELETE'} as http.IncomingMessage
    res = httpMocks.createResponse()
    const abortController = new AbortController()
    context = {
      signal: abortController.signal,
      cancel: () => abortController.abort(),
      abort: () => abortController.abort(),
    }
  })

  it('should 404 if no file id match', () => {
    fake_store.remove.rejects(ERRORS.FILE_NOT_FOUND)
    return assert.rejects(() => handler.send(req, res, context), {status_code: 404})
  })

  it('should 404 if no file ID', async () => {
    sinon.stub(handler, 'getFileIdFromRequest').returns(undefined)
    await assert.rejects(() => handler.send(req, res, context), {status_code: 404})
    assert.equal(fake_store.remove.callCount, 0)
  })

  it('must acknowledge successful DELETE requests with the 204', async () => {
    fake_store.remove.resolves()
    await handler.send(req, res, context)
    assert.equal(res.statusCode, 204)
  })

  it(`must fire the ${EVENTS.POST_TERMINATE} event`, (done) => {
    fake_store.remove.resolves()
    handler.on(EVENTS.POST_TERMINATE, (request, _, id) => {
      assert.deepStrictEqual(req, request)
      assert.equal(id, '1234')
      done()
    })
    handler.send(req, res, context)
  })

  it('must not allow terminating an upload if already completed', async () => {
    const handler = new DeleteHandler(fake_store, {
      relativeLocation: true,
      disableTerminationForFinishedUploads: true,
      path,
      locker: new MemoryLocker(),
    })

    fake_store.getUpload.resolves({
      id: 'abc',
      metadata: undefined,
      get sizeIsDeferred(): boolean {
        return false
      },
      creation_date: undefined,
      offset: 1000,
      size: 1000,
      storage: {type: 'test', path: `${path}/abc`},
    })
    await assert.rejects(() => handler.send(req, res, context), {status_code: 400})
  })
})
