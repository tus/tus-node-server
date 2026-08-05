import assert from 'node:assert'
import {randomUUID} from 'node:crypto'
import {ERRORS, type Locker} from '@tus/server'
import sinon from 'sinon'

export interface ContractLockerOptions {
  acquireLockTimeout?: number
  acquireLockRetry?: number
  redisLockTimeout?: number
}

export type LockerFactory = (options?: ContractLockerOptions) => Promise<Locker> | Locker

/**
 * The behavioural contract every Locker implementation must satisfy
 * Call it inside a `describe` and pass a factory that builds a fresh locker
 * Client specific wiring like key existence, watchdog TTL and cross instance coordination should live in the per adapter suites
 */
export function lockerContract(makeLocker: LockerFactory) {
  it('acquires a lock and releases it', async () => {
    const locker = await makeLocker()
    const id = randomUUID()

    const lock = locker.newLock(id)
    await lock.lock(new AbortController().signal, () => {})
    await lock.unlock()

    // Re-acquiring the same id must succeed once it has been released
    const again = locker.newLock(id)
    await again.lock(new AbortController().signal, () => {})
    await again.unlock()
  })

  it('acquires a lock by notifying the holder to release it', async () => {
    const locker = await makeLocker()
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

    // lock2 can only succeed if lock1 was nudged to release
    await lock2.lock(signal, async () => {
      cancel2()
    })

    await lock2.unlock()

    assert.strictEqual(cancel.callCount, 1, 'holder should be asked to release once')
    assert.strictEqual(cancel2.callCount, 0, 'uncontended lock2 should never be nudged')
  })

  it('returns a lock timeout error when the holder never releases', async () => {
    const locker = await makeLocker({acquireLockTimeout: 400})
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
    const locker = await makeLocker({acquireLockTimeout: 5000})
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

  it('throws when releasing a lock that was never acquired', async () => {
    const locker = await makeLocker()
    const lock = locker.newLock(randomUUID())
    await assert.rejects(lock.unlock(), /unlocked lock/)
  })
}
