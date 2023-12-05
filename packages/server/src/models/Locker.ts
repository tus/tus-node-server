import {ERRORS} from '../constants'

export type RequestRelease = () => Promise<void> | void

// The Locker interface defines methods for implementing a locking mechanism.
// This is crucial for ensuring exclusive access to uploads and their metadata.
// Following TUS recommendations, it's important to cancel locks from previous requests
// to avoid holding locks for too long and to manage half-open TCP connections effectively.
// The lock method includes a cancel callback to facilitate the cancellation of a request that previously acquired the lock.
export interface Locker {
  lock(id: string, cancelReq: RequestRelease): Promise<void>
  unlock(id: string): Promise<void>
}

export interface MemoryLockerOptions {
  acquireLockTimeout: number
}

class Lock {
  public requestRelease?: RequestRelease
}

// MemoryLocker is an implementation of the Locker interface, maintaining locks in memory.
// It ensures exclusive access to upload resources by managing locks for each upload.
// The lock() method ensures that any previously held lock is released before acquiring a new one.
// Lock acquisition attempts will timeout based on the specified 'acquireLockTimeout' duration.
export class MemoryLocker implements Locker {
  private locks = new Map<string, Lock>()
  protected timeout: number

  constructor(options?: MemoryLockerOptions) {
    this.timeout = options?.acquireLockTimeout ?? 1000 * 30
  }

  async lock(id: string, requestRelease: RequestRelease): Promise<void> {
    const abortController = new AbortController()
    const lock = await Promise.race([
      this.waitTimeout(abortController.signal),
      this.acquireLock(id, abortController.signal),
    ])

    abortController.abort()

    if (!lock) {
      throw ERRORS.ERR_LOCK_TIMEOUT
    }
    lock.requestRelease = requestRelease
  }

  protected async acquireLock(id: string, signal: AbortSignal): Promise<Lock | void> {
    if (signal.aborted) {
      return
    }

    const lock = this.locks.get(id)

    if (!lock) {
      const lock = new Lock()
      this.locks.set(id, lock)
      return lock
    }

    await lock.requestRelease?.()

    const potentialNewLock = this.locks.get(id)
    if (!potentialNewLock) {
      const lock = new Lock()
      this.locks.set(id, lock)
      return lock
    }

    return await new Promise((resolve, reject) => {
      // Using setImmediate to:
      // 1. Prevent stack overflow by deferring recursive calls to the next event loop iteration.
      // 2. Allow event loop to process other pending events, maintaining server responsiveness.
      // 3. Ensure fairness in lock acquisition by giving other requests a chance to acquire the lock.
      setImmediate(() => {
        this.acquireLock(id, signal).then(resolve).catch(reject)
      })
    })
  }

  async unlock(id: string): Promise<void> {
    const lock = this.locks.get(id)
    if (!lock) {
      throw new Error('Releasing an unlocked lock!')
    }

    this.locks.delete(id)
  }

  protected waitTimeout(signal: AbortSignal) {
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve()
      }, this.timeout)

      const abortListener = () => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abortListener)
        resolve()
      }
      signal.addEventListener('abort', abortListener)
    })
  }
}
