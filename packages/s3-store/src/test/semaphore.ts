import assert from 'node:assert/strict'

import {Permit, Semaphore} from '../semaphore.js'

describe('Semaphore', () => {
  it('limits the number of concurrently acquired permits', async () => {
    const semaphore = new Semaphore(1)
    const firstPermit = await semaphore.acquire()
    let secondPermitAcquired = false

    const secondPermitPromise = semaphore.acquire().then((permit) => {
      secondPermitAcquired = true
      return permit
    })

    await Promise.resolve()
    assert.equal(secondPermitAcquired, false)

    await firstPermit.release()
    assert.ok((await secondPermitPromise) instanceof Permit)
  })

  it('resolves queued permit requests in FIFO order', async () => {
    const semaphore = new Semaphore(1)
    const firstPermit = await semaphore.acquire()
    const acquired: number[] = []

    const secondPermitPromise = semaphore.acquire().then((permit) => {
      acquired.push(2)
      return permit
    })
    const thirdPermitPromise = semaphore.acquire().then((permit) => {
      acquired.push(3)
      return permit
    })

    await firstPermit.release()
    const secondPermit = await secondPermitPromise
    assert.deepEqual(acquired, [2])

    await secondPermit.release()
    await thirdPermitPromise
    assert.deepEqual(acquired, [2, 3])
  })
})

describe('Permit', () => {
  it('only releases its semaphore once', async () => {
    const semaphore = new Semaphore(1)
    const firstPermit = await semaphore.acquire()
    const secondPermitPromise = semaphore.acquire()
    let thirdPermitAcquired = false

    const thirdPermitPromise = semaphore.acquire().then((permit) => {
      thirdPermitAcquired = true
      return permit
    })

    await firstPermit.release()
    await firstPermit.release()

    const secondPermit = await secondPermitPromise
    await Promise.resolve()
    assert.equal(thirdPermitAcquired, false)

    await secondPermit.release()
    assert.ok((await thirdPermitPromise) instanceof Permit)
  })
})
