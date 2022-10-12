import 'should'

import {strict as assert} from 'node:assert'
import fs from 'node:fs'
import stream from 'node:stream'
import http from 'node:http'

import sinon from 'sinon'

import GetHandler from '../lib/handlers/GetHandler'
import DataStore from '../lib/stores/DataStore'
import FileStore from '../lib/stores/FileStore'

const hasHeader = (res: any, header: any) => {
  const key = Object.keys(header)[0]
  return res._header.includes(`${key}: ${header[key]}`)
}

describe('GetHandler', () => {
  const path = '/test/output'
  let req: {url: string; headers: Record<string, string>} = {
    headers: {},
    url: '/',
  }
  // @ts-expect-error
  let res: http.ServerResponse<http.IncomingMessage> = new http.ServerResponse({
    method: 'GET',
  })

  beforeEach((done: any) => {
    req = {headers: {}, url: '/'}
    // @ts-expect-error
    res = new http.ServerResponse({method: 'GET'})
    done()
  })

  describe('test error responses', () => {
    it('should 404 when file does not exist', async () => {
      const store = sinon.createStubInstance(FileStore)
      store.getOffset.rejects({status_code: 404})
      const handler = new GetHandler(store, {path})
      const spy_getFileIdFromRequest = sinon.spy(handler, 'getFileIdFromRequest')
      req.url = `${path}/1234`
      // @ts-expect-error todo
      await assert.rejects(() => handler.send(req, res), {status_code: 404})
      // @ts-expect-error todo
      assert.equal(spy_getFileIdFromRequest.calledOnceWith(req), true)
    })

    it('should 404 for non registered path', async () => {
      const store = sinon.createStubInstance(FileStore)
      const handler = new GetHandler(store, {path})
      const spy_getFileIdFromRequest = sinon.spy(handler, 'getFileIdFromRequest')
      req.url = `/not_a_valid_file_path`
      // @ts-expect-error
      await assert.rejects(() => handler.send(req, res), {status_code: 404})
      assert.equal(spy_getFileIdFromRequest.callCount, 1)
    })

    it('should 404 when file is not complete', async () => {
      const store = sinon.createStubInstance(FileStore)
      store.getOffset.resolves({id: 'id', size: 512, upload_length: '1024'})
      const handler = new GetHandler(store, {path})
      const fileId = '1234'
      req.url = `${path}/${fileId}`
      // @ts-expect-error
      await assert.rejects(() => handler.send(req, res), {status_code: 404})
      assert.equal(store.getOffset.calledWith(fileId), true)
    })

    it('should 500 on error store.getOffset error', () => {
      // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
      const store = new DataStore({path})
      ;(store as any).read = () => {}
      const fakeStore = sinon.stub(store)
      fakeStore.getOffset.rejects()
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
      const handler = new GetHandler(fakeStore)
      req.url = `${path}/1234`
      // @ts-expect-error
      return assert.rejects(() => handler.send(req, res))
    })

    it('test invalid stream', async () => {
      const store = sinon.createStubInstance(FileStore)
      const size = 512
      store.getOffset.resolves({id: 'id', size, upload_length: size.toString()})
      // @ts-expect-error
      store.read.returns(stream.Readable.from(fs.createReadStream('invalid_path')))
      const handler = new GetHandler(store, {path})
      const fileId = '1234'
      req.url = `${path}/${fileId}`
      // @ts-expect-error
      await handler.send(req, res)
      assert.equal(res.statusCode, 200)
      assert.equal(store.getOffset.calledWith(fileId), true)
      assert.equal(store.read.calledWith(fileId), true)
    })
  })

  describe('send()', () => {
    it('test if `file_id` is properly passed to store', async () => {
      const store = sinon.createStubInstance(FileStore)
      store.getOffset.resolves({id: '1234', size: 512, upload_length: '512'})
      // @ts-expect-error
      store.read.returns(stream.Readable.from(Buffer.alloc(512)))
      const handler = new GetHandler(store, {path})
      const fileId = '1234'
      req.url = `${path}/${fileId}`
      // @ts-expect-error
      await handler.send(req, res)
      assert.equal(store.getOffset.calledWith(fileId), true)
      assert.equal(store.read.calledWith(fileId), true)
    })

    it('test successful response', async () => {
      const store = sinon.createStubInstance(FileStore)
      const size = 512
      store.getOffset.resolves({id: '1234', size, upload_length: size.toString()})
      // @ts-expect-error
      store.read.returns(stream.Readable.from(Buffer.alloc(size), {objectMode: false}))
      const handler = new GetHandler(store, {path})
      const fileId = '1234'
      req.url = `${path}/${fileId}`
      // @ts-expect-error
      await handler.send(req, res)
      assert.equal(res.statusCode, 200)
      assert.equal(hasHeader(res, {'Content-Length': size}), true)
      assert.equal(store.getOffset.calledOnceWith(fileId), true)
      assert.equal(store.read.calledOnceWith(fileId), true)
    })
  })

  describe('registerPath()', () => {
    it('should call registered path handler', async () => {
      const fakeStore = sinon.stub(new DataStore())
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
      const handler = new GetHandler(fakeStore)
      const customPath1 = `/path1`
      const pathHandler1 = sinon.spy()
      handler.registerPath(customPath1, pathHandler1)
      const customPath2 = `/path2`
      const pathHandler2 = sinon.spy()
      handler.registerPath(customPath2, pathHandler2)
      req.url = `${customPath1}`
      // @ts-expect-error
      await handler.send(req, res)
      assert.equal(pathHandler1.calledOnceWith(req, res), true)
      assert.equal(pathHandler2.callCount, 0)
      req.url = `${customPath2}`
      // @ts-expect-error
      await handler.send(req, res)
      assert.equal(pathHandler1.callCount, 1)
      assert.equal(pathHandler2.calledOnceWith(req, res), true)
    })

    it('should not call DataStore when path matches registered path', async () => {
      const fakeStore = sinon.stub(new DataStore())
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
      const handler = new GetHandler(fakeStore)
      const spy_getFileIdFromRequest = sinon.spy(handler, 'getFileIdFromRequest')
      const customPath = `/path`
      handler.registerPath(customPath, () => {})
      req.url = `${customPath}`
      // @ts-expect-error
      await handler.send(req, res)
      assert.equal(spy_getFileIdFromRequest.callCount, 0)
      assert.equal(fakeStore.getOffset.callCount, 0)
    })
  })

  describe('DataStore without `read` method', () => {
    it('should 404 if not implemented', async () => {
      const fakeStore = sinon.stub(new DataStore())
      fakeStore.getOffset.resolves({id: '1234', size: 512, upload_length: '512'})
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
      const handler = new GetHandler(fakeStore)
      req.url = `/${path}/1234`
      // @ts-expect-error
      await assert.rejects(() => handler.send(req, res), {status_code: 404})
    })
  })
})
