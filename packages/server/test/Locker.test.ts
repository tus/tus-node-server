import assert from 'node:assert'
import sinon from 'sinon'
import {ERRORS, MemoryLocker} from '../src'

describe('MemoryLocker', () => {
  it('will acquire a lock by notifying another to release it', async () => {
    const locker = new MemoryLocker()
    const lockId = 'upload-id-1'

    const cancel = sinon.spy()
    const cancel2 = sinon.spy()

    const lock1 = locker.newLock(lockId)
    const lock2 = locker.newLock(lockId)

    await lock1.lock(async () => {
      await lock1.unlock()
      cancel()
    })

    await lock2.lock(async () => {
      cancel2()
    })

    await lock2.unlock()

    assert(cancel.callCount === 1, `calls count dont match ${cancel.callCount} !== 1`)
    assert(cancel2.callCount === 0, `calls count dont match ${cancel.callCount} !== 1`)
  })

  it('will return a lock timeout error', async () => {
    const locker = new MemoryLocker({
      acquireLockTimeout: 500,
    })
    const lockId = 'upload-id-1'
    const lock = locker.newLock(lockId)

    const cancel = sinon.spy()

    await lock.lock(async () => {
      cancel()
      // We note that the function has been called, but do not
      // release the lock
    })

    try {
      await lock.lock(async () => {
        throw new Error('panic should not be called')
      })
    } catch (e) {
      assert(!(e instanceof Error), `error returned is not correct ${e.message}`)
      assert('body' in e, 'body is not present in the error')
      assert(e.body === ERRORS.ERR_LOCK_TIMEOUT.body)
    }
  })

  it('request lock and unlock', async () => {
    const locker = new MemoryLocker()
    const lockId = 'upload-id-1'
    const lock = locker.newLock(lockId)
    const lock2 = locker.newLock(lockId)

    const cancel = sinon.spy()
    await lock.lock(() => {
      cancel()
      setTimeout(async () => {
        await lock.unlock()
      }, 50)
    })

    await lock2.lock(() => {
      throw new Error('should not be called')
    })

    await lock2.unlock()

    assert(
      cancel.callCount > 0,
      `request released called more times than expected - ${cancel.callCount}`
    )
  })
})
