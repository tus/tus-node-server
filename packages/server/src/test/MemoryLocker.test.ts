import assert from 'node:assert'
import {MemoryLocker} from '@tus/server'
import sinon from 'sinon'
import {lockerContract} from './lockerContract.js'

describe('MemoryLocker', () => {
  // Shared behavioural contract used for any locker do prevent code duplicates
  lockerContract(
    (options) =>
      new MemoryLocker({acquireLockTimeout: options?.acquireLockTimeout ?? 1000})
  )

  // Memory specific tests below

  it('lets a contender in once the holder releases on its own', async () => {
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
})
