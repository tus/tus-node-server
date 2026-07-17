import assert from 'node:assert'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {ERRORS, IoRedisLocker} from '@tus/server'
import {Redis} from 'ioredis'
import sinon from 'sinon'

// Integration tests requiring a reachable Redis. Skipped (not failed) when none
// is available. Point at a different instance with REDIS_URL.
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'

describe('IoRedisLocker', () => {
  const conns: Redis[] = []
  let probe: Redis

  function client() {
    const c = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    })
    c.on('error', () => {})
    conns.push(c)
    return c
  }

  function makeLocker(options: Partial<Record<string, number>> = {}) {
    return new IoRedisLocker({
      ioredis: client(),
      subscriber: client(),
      acquireLockTimeout: 1000,
      acquireLockRetry: 50,
      redisLockTimeout: 1000,
      ...options,
    })
  }

  before(async function () {
    try {
      probe = client()
      await probe.connect()
      await probe.ping()
    } catch {
      // No Redis reachable — skip the suite instead of failing.
      this.skip()
    }
  })

  after(async () => {
    await Promise.allSettled(conns.map((c) => c.quit()))
  })

  it('acquires a lock and releases it', async () => {
    const locker = makeLocker()
    const id = randomUUID()
    const lock = locker.newLock(id)

    await lock.lock(new AbortController().signal, () => {})
    assert.strictEqual(await probe.exists(`lock:${id}`), 1, 'key should exist while held')

    await lock.unlock()
    assert.strictEqual(
      await probe.exists(`lock:${id}`),
      0,
      'key should be gone after unlock'
    )
  })

  it('acquires a lock by notifying the holder to release it', async () => {
    const locker = makeLocker()
    const id = randomUUID()
    const signal = new AbortController().signal

    const cancel = sinon.spy()
    const cancel2 = sinon.spy()

    const lock1 = locker.newLock(id)
    const lock2 = locker.newLock(id)

    await lock1.lock(signal, async () => {
      await lock1.unlock()
      cancel()
    })

    await lock2.lock(signal, async () => {
      cancel2()
    })

    await lock2.unlock()

    assert.strictEqual(cancel.callCount, 1, 'holder should be asked to release once')
    assert.strictEqual(cancel2.callCount, 0, 'uncontended lock2 should never be nudged')
  })

  it('returns a lock timeout error when the holder never releases', async () => {
    const locker = makeLocker({acquireLockTimeout: 400})
    const id = randomUUID()
    const signal = new AbortController().signal

    const holder = locker.newLock(id)
    await holder.lock(signal, () => {
      // acknowledge but refuse to release
    })

    const contender = locker.newLock(id)
    await assert.rejects(
      contender.lock(signal, () => {}),
      (e) => e === ERRORS.ERR_LOCK_TIMEOUT
    )

    await holder.unlock()
  })

  it('stops trying to acquire when the abort signal is aborted', async () => {
    const locker = makeLocker({acquireLockTimeout: 5000})
    const id = randomUUID()
    const abortController = new AbortController()

    const holder = locker.newLock(id)
    await holder.lock(abortController.signal, () => {
      // refuse to release
    })

    setTimeout(() => abortController.abort(), 100)

    const contender = locker.newLock(id)
    await assert.rejects(
      contender.lock(abortController.signal, () => {}),
      (e) => e === ERRORS.ERR_LOCK_TIMEOUT
    )

    await holder.unlock()
  })

  it('keeps the lock alive past its TTL via the watchdog', async () => {
    const locker = makeLocker({redisLockTimeout: 400})
    const id = randomUUID()
    const lock = locker.newLock(id)

    await lock.lock(new AbortController().signal, () => {})

    await delay(700)
    assert.strictEqual(
      await probe.exists(`lock:${id}`),
      1,
      'watchdog should keep the key alive'
    )

    await lock.unlock()
    assert.strictEqual(await probe.exists(`lock:${id}`), 0)
  })

  it('coordinates the lock across two separate locker instances', async () => {
    const a = makeLocker()
    const b = makeLocker()
    const id = randomUUID()
    const signal = new AbortController().signal

    const released = sinon.spy()

    const lockA = a.newLock(id)
    await lockA.lock(signal, async () => {
      await lockA.unlock()
      released()
    })

    const lockB = b.newLock(id)
    await lockB.lock(signal, () => {})
    await lockB.unlock()

    assert.strictEqual(released.callCount, 1, 'nudge should cross connections via Redis')
  })
})
