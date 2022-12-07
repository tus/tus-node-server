import 'should'

import {strict as assert} from 'node:assert'
import type http from 'node:http'

import sinon from 'sinon'
import httpMocks from 'node-mocks-http'

import {DataStore} from '../src/models/DataStore'
import {DeleteHandler} from '../src/handlers/DeleteHandler'
import {ERRORS, EVENTS} from '../src/constants'

describe('DeleteHandler', () => {
  const path = '/test/output'
  const fake_store = sinon.createStubInstance(DataStore)
  let handler: InstanceType<typeof DeleteHandler>
  let req: http.IncomingMessage
  let res: httpMocks.MockResponse<http.ServerResponse>

  beforeEach(() => {
    fake_store.remove.resetHistory()
    handler = new DeleteHandler(fake_store, {relativeLocation: true, path})
    req = {url: `${path}/1234`, method: 'DELETE'} as http.IncomingMessage
    res = httpMocks.createResponse()
  })

  it('should 404 if no file id match', () => {
    fake_store.remove.rejects(ERRORS.FILE_NOT_FOUND)
    return assert.rejects(() => handler.send(req, res), {status_code: 404})
  })

  it('should 404 if no file ID', async () => {
    sinon.stub(handler, 'getFileIdFromRequest').returns(false)
    await assert.rejects(() => handler.send(req, res), {status_code: 404})
    assert.equal(fake_store.remove.callCount, 0)
  })

  it('must acknowledge successful DELETE requests with the 204', async () => {
    fake_store.remove.resolves()
    await handler.send(req, res)
    assert.equal(res.statusCode, 204)
  })

  it(`must fire the ${EVENTS.POST_TERMINATE} event`, (done) => {
    fake_store.remove.resolves()
    handler.on(EVENTS.POST_TERMINATE, (request, _, id) => {
      assert.deepStrictEqual(req, request)
      assert.equal(id, '1234')
      done()
    })
    handler.send(req, res)
  })
})
