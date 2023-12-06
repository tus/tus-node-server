import {ERRORS} from '../constants'
import {Locker, RequestRelease} from '../models/Locker'

export interface MemoryLockerOptions {
  acquireLockTimeout: number
}

class Lock {
  public requestRelease?: RequestRelease
}

/**
 * MemoryLocker is an implementation of the Locker interface that manages locks in memory.
 * This class is designed for exclusive access control over resources, often used in scenarios like upload management.
 *
 * Key Features:
 * - Ensures exclusive resource access by using a memory-based map to track locks.
 * - Implements timeout for lock acquisition, mitigating deadlock situations.
 * - Facilitates both immediate and graceful release of locks through different mechanisms.
 *
 * Locking Behavior:
 * - When the `lock` method is invoked for an already locked resource, the `cancelReq` callback is called.
 *   This signals to the current lock holder that another process is requesting the lock, encouraging them to release it as soon as possible.
 * - The lock attempt continues until the specified timeout is reached. If the timeout expires and the lock is still not
 *   available, an error is thrown to indicate lock acquisition failure.
 *
 * Lock Acquisition and Release:
 * - The `lock` method implements a wait mechanism, allowing a lock request to either succeed when the lock becomes available,
 *   or fail after the timeout period.
 * - The `unlock` method releases a lock, making the resource available for other requests.
 */
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
