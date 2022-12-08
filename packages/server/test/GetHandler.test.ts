import 'should'

import {strict as assert} from 'node:assert'
import fs from 'node:fs'
import stream from 'node:stream'
import http from 'node:http'

import sinon from 'sinon'
import httpMocks from 'node-mocks-http'

import {GetHandler} from '../src/handlers/GetHandler'
import {DataStore} from '../src/models/DataStore'
import {FileStore} from '@tus/file-store'
import {Upload} from '../src/models/Upload'

describe('GetHandler', () => {
  const path = '/test/output'
  const serverOptions = {path}
  let req: http.IncomingMessage
  let res: http.ServerResponse

  beforeEach(() => {
    req = httpMocks.createRequest({method: 'GET'})
    res = httpMocks.createResponse({req})
  })

  describe('test error responses', () => {
    it('should 404 when file does not exist', async () => {
      const store = sinon.createStubInstance(FileStore)
      store.getUpload.rejects({status_code: 404})
      const handler = new GetHandler(store, {path})
      const spy_getFileIdFromRequest = sinon.spy(handler, 'getFileIdFromRequest')
      req.url = `${path}/1234`
      await assert.rejects(() => handler.send(req, res), {status_code: 404})
      assert.equal(spy_getFileIdFromRequest.calledOnceWith(req), true)
    })

    it('should 404 for non registered path', async () => {
      const store = sinon.createStubInstance(FileStore)
      const handler = new GetHandler(store, {path})
      const spy_getFileIdFromRequest = sinon.spy(handler, 'getFileIdFromRequest')
      req.url = `/not_a_valid_file_path`
      await assert.rejects(() => handler.send(req, res), {status_code: 404})
      assert.equal(spy_getFileIdFromRequest.callCount, 1)
    })

    it('should 404 when file is not complete', async () => {
      const store = sinon.createStubInstance(FileStore)
      store.getUpload.resolves(new Upload({id: '1234', offset: 512, size: 1024}))
      const handler = new GetHandler(store, {path})
      const fileId = '1234'
      req.url = `${path}/${fileId}`
      await assert.rejects(() => handler.send(req, res), {status_code: 404})
      assert.equal(store.getUpload.calledWith(fileId), true)
    })

    it('should 500 on error store.getUpload error', () => {
      const store = new DataStore()
      // @ts-expect-error ...
      store.read = () => {}
      const fakeStore = sinon.stub(store)
      fakeStore.getUpload.rejects()
      const handler = new GetHandler(fakeStore, serverOptions)
      req.url = `${path}/1234`
      return assert.rejects(() => handler.send(req, res))
    })

    it('test invalid stream', async () => {
      const store = sinon.createStubInstance(FileStore)
      const size = 512
      store.getUpload.resolves(new Upload({id: '1234', offset: size, size}))
      // @ts-expect-error what should this be?
      store.read.returns(stream.Readable.from(fs.createReadStream('invalid_path')))
      const handler = new GetHandler(store, {path})
      const fileId = '1234'
      req.url = `${path}/${fileId}`
      await handler.send(req, res)
      assert.equal(res.statusCode, 200)
      assert.equal(store.getUpload.calledWith(fileId), true)
      assert.equal(store.read.calledWith(fileId), true)
    })
  })

  describe('send()', () => {
    it('test if `file_id` is properly passed to store', async () => {
      const store = sinon.createStubInstance(FileStore)
      store.getUpload.resolves(new Upload({id: '1234', offset: 512, size: 512}))
      // @ts-expect-error should
      store.read.returns(stream.Readable.from(Buffer.alloc(512)))
      const handler = new GetHandler(store, {path})
      const fileId = '1234'
      req.url = `${path}/${fileId}`
      await handler.send(req, res)
      assert.equal(store.getUpload.calledWith(fileId), true)
      assert.equal(store.read.calledWith(fileId), true)
    })

    it('test successful response', async () => {
      const store = sinon.createStubInstance(FileStore)
      const size = 512
      store.getUpload.resolves(new Upload({id: '1234', offset: size, size}))
      // @ts-expect-error what should this be?
      store.read.returns(stream.Readable.from(Buffer.alloc(size), {objectMode: false}))
      const handler = new GetHandler(store, {path})
      const fileId = '1234'
      req.url = `${path}/${fileId}`
      await handler.send(req, res)
      assert.equal(res.statusCode, 200)
      // TODO: this is the get handler but Content-Length is only send in 204 OPTIONS requests?
      // assert.equal(res.getHeader('Content-Length'), size)
      assert.equal(store.getUpload.calledOnceWith(fileId), true)
      assert.equal(store.read.calledOnceWith(fileId), true)
    })
  })

  describe('registerPath()', () => {
    it('should call registered path handler', async () => {
      const fakeStore = sinon.stub(new DataStore())
      const handler = new GetHandler(fakeStore, serverOptions)
      const customPath1 = `/path1`
      const pathHandler1 = sinon.spy()
      handler.registerPath(customPath1, pathHandler1)
      const customPath2 = `/path2`
      const pathHandler2 = sinon.spy()
      handler.registerPath(customPath2, pathHandler2)
      req.url = `${customPath1}`
      await handler.send(req, res)
      assert.equal(pathHandler1.calledOnceWith(req, res), true)
      assert.equal(pathHandler2.callCount, 0)
      req.url = `${customPath2}`
      await handler.send(req, res)
      assert.equal(pathHandler1.callCount, 1)
      assert.equal(pathHandler2.calledOnceWith(req, res), true)
    })

    it('should not call DataStore when path matches registered path', async () => {
      const fakeStore = sinon.stub(new DataStore())
      const handler = new GetHandler(fakeStore, serverOptions)
      const spy_getFileIdFromRequest = sinon.spy(handler, 'getFileIdFromRequest')
      const customPath = `/path`
      handler.registerPath(customPath, () => {})
      req.url = `${customPath}`
      await handler.send(req, res)
      assert.equal(spy_getFileIdFromRequest.callCount, 0)
      assert.equal(fakeStore.getUpload.callCount, 0)
    })
  })

  describe('DataStore without `read` method', () => {
    it('should 404 if not implemented', async () => {
      const fakeStore = sinon.stub(new DataStore())
      fakeStore.getUpload.resolves(new Upload({id: '1234', offset: 512, size: 512}))
      const handler = new GetHandler(fakeStore, serverOptions)
      req.url = `/${path}/1234`
      await assert.rejects(() => handler.send(req, res), {status_code: 404})
    })
  })
})
