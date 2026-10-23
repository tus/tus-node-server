import assert from 'node:assert'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {IoRedisLocker} from '@tus/server'
import {Redis} from 'ioredis'
import sinon from 'sinon'
import {type ContractLockerOptions, lockerContract} from './lockerContract.js'

// Integration tests requiring a reachable Redis. Locally, when none is available,
// the suite is skipped rather than failed. In CI a Redis service is provisioned
// so an unreachable Redis fails instead. Point at a different instance with REDIS_URL
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'

// Localize sinon so it doesn't interfere with other tests when restore() is called (took me a bit to realize this...)
const sandbox = sinon.createSandbox()

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

  function makeLocker(options: ContractLockerOptions = {}) {
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
    } catch (err) {
      // Throw when in CI but just skip otherwise
      if (process.env.CI) {
        throw err
      }
      this.skip()
    }
  })

  afterEach(() => {
    sandbox.restore()
  })

  after(async () => {
    await Promise.allSettled(conns.map((c) => c.quit()))
  })

  lockerContract((options) => makeLocker(options))

  // Client specific tests below

  it('sets and clears the redis key around a lock', async () => {
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

  it('keeps the lock alive past its TTL via the watchdog', async () => {
    const locker = makeLocker({redisLockTimeout: 400})
    const id = randomUUID()
    const lock = locker.newLock(id)

    await lock.lock(new AbortController().signal, () => {})

    // Wait well beyond the 400ms TTL. The watchdog renews every ~200ms so the key must still exist
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
    // Two lockers with independent connections simulate two server processes
    const a = makeLocker()
    const b = makeLocker()
    const id = randomUUID()
    const signal = new AbortController().signal

    const released = sandbox.spy()

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

  it('releases the key if subscribing fails during acquisition', async () => {
    const ioredis = client()
    const subscriber = client()
    await ioredis.connect()
    await subscriber.connect()
    sandbox.stub(subscriber, 'subscribe').rejects(new Error('subscribe boom'))

    const locker = new IoRedisLocker({ioredis, subscriber, redisLockTimeout: 1000})
    const id = randomUUID()
    const lock = locker.newLock(id)

    await assert.rejects(
      lock.lock(new AbortController().signal, () => {}),
      /subscribe boom/
    )
    assert.strictEqual(
      await probe.exists(`lock:${id}`),
      0,
      'key must not be orphaned when subscribe fails'
    )
  })

  it('still releases ownership if unsubscribing fails during unlock', async () => {
    const ioredis = client()
    const subscriber = client()
    await ioredis.connect()
    await subscriber.connect()
    const locker = new IoRedisLocker({ioredis, subscriber, redisLockTimeout: 1000})
    const id = randomUUID()
    const lock = locker.newLock(id)

    await lock.lock(new AbortController().signal, () => {})
    sandbox.stub(subscriber, 'unsubscribe').rejects(new Error('unsubscribe boom'))

    await assert.rejects(lock.unlock(), /unsubscribe boom/)
    assert.strictEqual(
      await probe.exists(`lock:${id}`),
      0,
      'release EVAL must run even if unsubscribe fails'
    )
  })
})
