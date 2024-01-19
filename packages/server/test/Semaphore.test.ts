// Credits: https://github.com/Shopify/quilt/blob/main/packages/semaphore/src/tests/Semaphore.test.ts

import {Permit, Semaphore} from '../src'
import assert from 'node:assert'
import sinon from 'sinon'

describe('Semaphore', () => {
  describe('acquire()', () => {
    it('resolves with a permit when counter is > 0', async () => {
      const semaphore = new Semaphore(1)

      assert.equal((await semaphore.acquire()) instanceof Permit, true)
    })

    it('does not resolve if counter is = 0', async () => {
      const semaphore = new Semaphore(1)

      await semaphore.acquire()

      const spy = sinon.spy()

      semaphore
        .acquire()
        .then(spy)
        .catch(() => {})

      await setTimeout(() => {}, 0)

      assert.equal(spy.callCount, 0)
    })

    it('resolves when previous permit is released before the call', async () => {
      const semaphore = new Semaphore(1)

      const permit = await semaphore.acquire()
      permit.release()

      assert.equal((await semaphore.acquire()) instanceof Permit, true)
    })

    it('resolves when previous permit is released after the call', async () => {
      const semaphore = new Semaphore(1)

      const permit = await semaphore.acquire()

      const spy = sinon.spy()

      semaphore
        .acquire()
        .then(spy)
        .catch(() => {})

      await setTimeout(() => {}, 0)

      assert.equal(spy.callCount, 0)

      await permit.release()

      assert.equal(spy.callCount > 0, true)
    })

    it('calls resolve in same order as called when previous permits are released', async () => {
      const semaphore = new Semaphore(2)

      const permit1 = await semaphore.acquire()
      const permit2 = await semaphore.acquire()

      const spy3 = sinon.spy()
      const spy4 = sinon.spy()

      semaphore
        .acquire()
        .then(spy3)
        .catch(() => {})
      semaphore
        .acquire()
        .then(spy4)
        .catch(() => {})

      await setTimeout(() => {}, 0)

      assert.equal(spy3.callCount, 0)
      assert.equal(spy4.callCount, 0)

      await permit2.release()

      assert.equal(spy3.callCount > 0, true)
      assert.equal(spy4.callCount, 0)

      await permit1.release()

      assert.equal(spy3.callCount > 0, true)
    })

    it('does not allow acquiring more permits than initially allowed', async () => {
      const semaphore = new Semaphore(1)

      const promise1 = semaphore.acquire()
      const promise2 = semaphore.acquire()

      ;(await promise1).release()
      ;(await promise2).release()

      const spy3 = sinon.spy()
      const spy4 = sinon.spy()

      semaphore
        .acquire()
        .then(spy3)
        .catch(() => {})
      semaphore
        .acquire()
        .then(spy4)
        .catch(() => {})

      await setTimeout(() => {}, 0)

      assert.equal(spy3.callCount > 0, true)
      assert.equal(spy4.callCount, 0)
    })
  })
})

describe('Permit', () => {
  describe('release()', () => {
    it('has no effect when called a second time', async () => {
      const semaphore = new Semaphore(1)

      const permit = await semaphore.acquire()

      const spy2 = sinon.spy()
      const spy3 = sinon.spy()

      semaphore
        .acquire()
        .then(spy2)
        .catch(() => {})
      semaphore
        .acquire()
        .then(spy3)
        .catch(() => {})

      await permit.release()

      assert.equal(spy2.callCount > 0, true)
      assert.equal(spy3.callCount, 0)

      await permit.release()

      assert.equal(spy3.callCount, 0)
    })
  })
})
