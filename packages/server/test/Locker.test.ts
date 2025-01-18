import assert from 'node:assert'
import sinon from 'sinon'
import {ERRORS, MemoryLocker} from '../src'

describe('MemoryLocker', () => {
  it('will acquire a lock by notifying another to release it', async () => {
    const locker = new MemoryLocker()
    const lockId = 'upload-id-1'
    const abortController = new AbortController()

    const cancel = sinon.spy()
    const cancel2 = sinon.spy()

    const lock1 = locker.newLock(lockId)
    const lock2 = locker.newLock(lockId)

    await lock1.lock(abortController.signal, async () => {
      await lock1.unlock()
      cancel()
    })

    await lock2.lock(abortController.signal, async () => {
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
    const abortController = new AbortController()

    const lockId = 'upload-id-1'
    const lock = locker.newLock(lockId)

    const cancel = sinon.spy()

    await lock.lock(abortController.signal, async () => {
      cancel()
      // We note that the function has been called, but do not
      // release the lock
    })

    try {
      await lock.lock(abortController.signal, async () => {
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
    const abortController = new AbortController()

    const lock = locker.newLock(lockId)
    const lock2 = locker.newLock(lockId)

    const cancel = sinon.spy()
    await lock.lock(abortController.signal, () => {
      cancel()
      setTimeout(async () => {
        await lock.unlock()
      }, 50)
    })

    await lock2.lock(abortController.signal, () => {
      throw new Error('should not be called')
    })

    await lock2.unlock()

    assert(
      cancel.callCount > 0,
      `request released called more times than expected - ${cancel.callCount}`
    )
  })

  it('will stop trying to acquire the lock if the abort signal is aborted', async () => {
    const locker = new MemoryLocker()
    const lockId = 'upload-id-1'
    const abortController = new AbortController()

    const cancel = sinon.spy()
    const cancel2 = sinon.spy()

    const lock1 = locker.newLock(lockId)
    const lock2 = locker.newLock(lockId)

    await lock1.lock(abortController.signal, async () => {
      // do not unlock when requested
      cancel()
    })

    // Abort signal is aborted after lock2 tries to acquire the lock
    setTimeout(() => {
      abortController.abort()
    }, 100)

    try {
      await lock2.lock(abortController.signal, async () => {
        cancel2()
      })
      assert(false, 'lock2 should not have been acquired')
    } catch (e) {
      assert(e === ERRORS.ERR_LOCK_TIMEOUT, `error returned is not correct ${e}`)
    }

    assert(cancel.callCount > 1, `calls count dont match ${cancel.callCount} !== 1`)
    assert(cancel2.callCount === 0, `calls count dont match ${cancel.callCount} !== 1`)
  })
})
