import {MemoryLocker} from '../src/models/Locker'
import assert from 'node:assert'
import sinon from 'sinon'
import {ERRORS} from '../src'

describe('MemoryLocker', () => {
  it('will acquire a lock by notifying another to release it', async () => {
    const locker = new MemoryLocker()
    const lockId = 'upload-id-1'

    const cancel = sinon.spy()
    const cancel2 = sinon.spy()

    await locker.lock(lockId, async () => {
      await locker.unlock(lockId)
      cancel()
    })

    await locker.lock(lockId, async () => {
      cancel2()
    })

    await locker.unlock(lockId)

    assert(cancel.callCount === 1, `calls count dont match ${cancel.callCount} !== 1`)
    assert(cancel2.callCount === 0, `calls count dont match ${cancel.callCount} !== 1`)
  })

  it('will return a lock timeout error', async () => {
    const locker = new MemoryLocker({
      acquireLockTimeout: 500,
    })
    const lockId = 'upload-id-1'

    const cancel = sinon.spy()

    await locker.lock(lockId, async () => {
      cancel()
      // We note that the function has been called, but do not
      // release the lock
    })

    try {
      await locker.lock(lockId, async () => {
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

    const cancel = sinon.spy()
    await locker.lock(lockId, () => {
      cancel()
      setTimeout(async () => {
        await locker.unlock(lockId)
      }, 50)
    })

    await locker.lock(lockId, () => {
      throw new Error('should not be called')
    })

    await locker.unlock(lockId)

    assert(
      cancel.callCount > 0,
      `request released called more times than expected - ${cancel.callCount}`
    )
  })
})
