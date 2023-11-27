import {ERRORS} from '../constants'

export type RequestRelease = () => Promise<void> | void

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
