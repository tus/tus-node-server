import assert from 'node:assert'
import sinon from 'sinon'
import {ERRORS} from '@tus/utils'
import {GCSLocker} from '../'
import {Storage} from '@google-cloud/storage'
import * as shared from 'test/stores.test'

const storage = new Storage({keyFilename: '../../keyfile.json'})
const bucket = storage.bucket('tus-node-server-ci')

describe('GCSLocker', () => {
  it('will acquire a lock by notifying another to release it', async () => {
    const locker = new GCSLocker({bucket, lockTTL: 1000 * 4, watchInterval: 1000 * 2})
    const lockId = shared.testId('notify-lock')
    const abortController = new AbortController()

    const cancel = sinon.spy()
    const cancel2 = sinon.spy()

    const lock1 = locker.newLock(lockId)
    const lock2 = locker.newLock(lockId)

    await lock1.lock(abortController.signal, async () => {
      console.log('lock1 requestRelease callback')
      cancel()
    })

    await lock2.lock(abortController.signal, async () => {
      console.log('lock2 requestRelease callback')
      cancel2()
    })

    await lock2.unlock()

    assert(
      cancel.calledOnce,
      `lock 1 requestRelease should be called once but got ${cancel.callCount}`
    )
    assert(
      cancel2.notCalled,
      `lock 2 requestRelease should not be called but got ${cancel2.callCount}`
    )
  })

  it('request lock and unlock', async () => {
    const locker = new GCSLocker({bucket, lockTTL: 1000 * 4, watchInterval: 1000 * 2})
    const lockId = shared.testId('request-lock')
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
    const locker = new GCSLocker({
      bucket,
      lockTTL: 1000 * 4,
      watchInterval: 1000 * 2,
    })
    const lockId = shared.testId('abort-lock')
    const abortController = new AbortController()

    const cancel = sinon.spy()
    const cancel2 = sinon.spy()

    const lock1 = locker.newLock(lockId)
    const lock2 = locker.newLock(lockId)

    await lock1.lock(abortController.signal, async () => {
      console.log('requestRelease callback')
      // do not unlock when requested
      cancel()
    })

    // Abort signal is aborted after lock2 tries to acquire the lock
    setTimeout(() => {
      abortController.abort()
    }, 2500)

    try {
      await lock2.lock(abortController.signal, async () => {
        cancel2()
      })
      assert(false, 'lock2 should not have been acquired')
    } catch (e) {
      assert(e === ERRORS.ERR_LOCK_TIMEOUT, `error returned is not correct ${e}`)
    }

    console.log(cancel.callCount)
    assert.ok(cancel.calledOnce, `calls count dont match ${cancel.callCount}`)
    assert.ok(cancel2.notCalled, `calls count dont match ${cancel.callCount}`)
  })
})
