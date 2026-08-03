import {strict as assert} from 'node:assert'
import type {Readable} from 'node:stream'

import {MemoryLocker} from '@tus/server'
import {type CancellationContext, DataStore, EVENTS, Upload} from '@tus/utils'
import sinon from 'sinon'

import {BaseHandler} from '../handlers/BaseHandler.js'
import {createContext} from './utils.js'

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

  it('write() should omit the body for null-body statuses', () => {
    for (const status of [204, 205, 304]) {
      const res = handler.write(status, {}, 'ignored')
      assert.equal(res.status, status)
      assert.equal(res.body, null)
    }
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

  it('should reject decoded path separators and null bytes', () => {
    for (const id of ['..%2Ffile', '..%5Cfile', 'file%00', 'file%']) {
      const req = new Request(`https://example.com/test/output/${id}`)
      assert.equal(handler.getFileIdFromRequest(req), undefined)
    }
  })

  it('should allow IDs containing two consecutive dots', () => {
    const req = new Request('https://example.com/test/output/file..name')
    assert.equal(handler.getFileIdFromRequest(req), 'file..name')
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

class TestHandler extends BaseHandler {
  writeToStoreForTest(
    webStream: ReadableStream | null,
    upload: Upload,
    maxFileSize: number,
    context: CancellationContext
  ) {
    return this.writeToStore(webStream, upload, maxFileSize, context)
  }
}

const createControlledStream = () => {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const webStream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController
    },
  })

  if (!controller) {
    throw new Error('ReadableStream did not initialize synchronously')
  }

  return {controller, webStream}
}

const consumeStoreWrites = (
  store: sinon.SinonStubbedInstance<DataStore>,
  initialOffset = 0
) => {
  let offset = initialOffset
  const chunks: Promise<void>[] = []
  const resolvers: Array<() => void> = []

  const ensure = (index: number) => {
    while (chunks.length <= index) {
      chunks.push(
        new Promise<void>((resolve) => {
          resolvers.push(resolve)
        })
      )
    }
  }

  store.write.callsFake(async (readable: Readable) => {
    let index = 0
    for await (const chunk of readable) {
      offset += (chunk as Buffer).byteLength
      ensure(index)
      resolvers[index]?.()
      index++
    }

    return offset
  })

  return {
    waitForChunk(target: number) {
      ensure(target - 1)
      return chunks[target - 1]
    },
  }
}

describe('BaseHandler.writeToStore', () => {
  const interval = 100
  const maxFileSize = Number.MAX_SAFE_INTEGER
  let clock: sinon.SinonFakeTimers

  before(() => {
    clock = sinon.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'Date'],
    })
  })

  afterEach(() => {
    clock.reset()
  })

  after(() => {
    clock.restore()
  })

  const createHandler = () => {
    const store = sinon.createStubInstance(DataStore)
    const handler = new TestHandler(store, {
      path: '/files',
      locker: new MemoryLocker(),
      postReceiveInterval: interval,
    })

    return {handler, store}
  }

  it('does not emit late POST_RECEIVE progress after a short successful write', async () => {
    const {handler, store} = createHandler()
    consumeStoreWrites(store)
    const postReceive = sinon.spy()
    handler.on(EVENTS.POST_RECEIVE, postReceive)
    const context = createContext()
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('short upload'))
        controller.close()
      },
    })

    await handler.writeToStoreForTest(
      webStream,
      new Upload({id: 'short', offset: 0}),
      maxFileSize,
      context
    )

    assert.equal(clock.countTimers(), 0)
    assert.equal(postReceive.called, false)
  })

  it('does not schedule or emit POST_RECEIVE progress without listeners', async () => {
    const {handler, store} = createHandler()
    const {waitForChunk} = consumeStoreWrites(store)
    const emit = sinon.spy(handler, 'emit')
    const context = createContext()
    const {controller, webStream} = createControlledStream()

    const write = handler.writeToStoreForTest(
      webStream,
      new Upload({id: 'no-listener', offset: 0}),
      maxFileSize,
      context
    )
    controller.enqueue(Buffer.from('chunk'))
    await waitForChunk(1)

    assert.equal(clock.countTimers(), 0)

    controller.close()
    await write

    assert.equal(clock.countTimers(), 0)
    assert.equal(emit.withArgs(EVENTS.POST_RECEIVE).callCount, 0)
  })

  it('keeps intermediate progress without a terminal trailing event', async () => {
    const {handler, store} = createHandler()
    const {waitForChunk} = consumeStoreWrites(store, 10)
    const offsets: number[] = []
    handler.on(EVENTS.POST_RECEIVE, (_stream, upload) => {
      offsets.push(upload.offset)
    })
    const context = createContext()
    const {controller, webStream} = createControlledStream()

    const write = handler.writeToStoreForTest(
      webStream,
      new Upload({id: 'long', offset: 10}),
      maxFileSize,
      context
    )
    controller.enqueue(Buffer.alloc(4))
    await waitForChunk(1)
    await clock.tickAsync(interval)

    assert.deepEqual(offsets, [14])

    controller.enqueue(Buffer.alloc(3))
    await waitForChunk(2)
    await clock.tickAsync(interval)

    assert.deepEqual(offsets, [14, 17])

    controller.enqueue(Buffer.alloc(2))
    await waitForChunk(3)
    await clock.tickAsync(interval)

    assert.deepEqual(offsets, [14, 17, 19])

    controller.close()
    assert.equal(await write, 19)
    assert.equal(clock.countTimers(), 0)
    assert.deepEqual(offsets, [14, 17, 19])
  })

  it('cancels pending POST_RECEIVE progress after a store error', async () => {
    const {handler, store} = createHandler()
    const error = new Error('store failed')
    store.write.callsFake(async (readable: Readable) => {
      for await (const _chunk of readable) {
        throw error
      }
      return 0
    })
    const postReceive = sinon.spy()
    handler.on(EVENTS.POST_RECEIVE, postReceive)
    const context = createContext()
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(Buffer.from('chunk'))
        controller.close()
      },
    })

    await assert.rejects(
      handler.writeToStoreForTest(
        webStream,
        new Upload({id: 'error', offset: 0}),
        maxFileSize,
        context
      )
    )

    assert.equal(clock.countTimers(), 0)
    assert.equal(postReceive.called, false)
  })

  it('rejects when converting the web stream throws synchronously', async () => {
    const {handler} = createHandler()
    const context = createContext()

    await assert.rejects(
      handler.writeToStoreForTest(
        // @ts-expect-error testing invalid input at the runtime boundary
        {},
        new Upload({id: 'invalid-stream', offset: 0}),
        maxFileSize,
        context
      ),
      {code: 'ERR_INVALID_ARG_TYPE'}
    )
  })

  it('cancels pending POST_RECEIVE progress after an abort', async () => {
    const {handler, store} = createHandler()
    const {waitForChunk} = consumeStoreWrites(store)
    const postReceive = sinon.spy()
    handler.on(EVENTS.POST_RECEIVE, postReceive)
    const context = createContext()
    const {controller, webStream} = createControlledStream()

    const write = handler.writeToStoreForTest(
      webStream,
      new Upload({id: 'abort', offset: 0}),
      maxFileSize,
      context
    )
    controller.enqueue(Buffer.from('chunk'))
    await waitForChunk(1)

    assert.equal(clock.countTimers(), 1)

    context.abort()
    controller.close()
    assert.equal(await write, 5)

    assert.equal(clock.countTimers(), 0)
    assert.equal(postReceive.called, false)
  })

  it('emits the last observed offset while a write is stalled', async () => {
    const {handler, store} = createHandler()
    const {waitForChunk} = consumeStoreWrites(store, 7)
    const offsets: number[] = []
    handler.on(EVENTS.POST_RECEIVE, (_stream, upload) => {
      offsets.push(upload.offset)
    })
    const context = createContext()
    const {controller, webStream} = createControlledStream()
    let settled = false

    const write = handler.writeToStoreForTest(
      webStream,
      new Upload({id: 'stalled', offset: 7}),
      maxFileSize,
      context
    )
    write.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    controller.enqueue(Buffer.alloc(5))
    await waitForChunk(1)

    await clock.tickAsync(interval - 1)
    assert.deepEqual(offsets, [])
    assert.equal(settled, false)

    await clock.tickAsync(1)
    assert.deepEqual(offsets, [12])
    assert.equal(settled, false)

    controller.close()
    await write

    assert.equal(clock.countTimers(), 0)
  })
})
