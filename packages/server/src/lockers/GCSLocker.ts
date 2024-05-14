import {ERRORS, Lock, Locker, RequestRelease} from '@tus/utils'
import {Bucket} from '@google-cloud/storage'
import EventEmitter from 'node:events'
import GCSLock from './GCSLock'

/**
 * Google Cloud Storage implementation of the Locker mechanism with support for distribution.
 * For general information regarding Locker, see MemoryLocker.
 *
 * Locking is based on separate .lock files created in a GCS bucket (presumably the same as the upload destination, but not necessarily). Concurrency control is ensured by metageneration preconditions. Release mechanism is based on separate .release files. After a lock file is created, we regularly check if another process requested releasing the lock (by creating the release file). To avoid resources being locked forever, each lock's metadata is regularly updated, this way we can make sure the locker process haven't crashed.
 *
 * Lock file health - possible states of a lock file:
 * - non-existing (not locked)
 * - healthy (locked)
 * - requested to be released (locked, but should be released soon)
 * - expired (not locked)
 *
 * Acquiring a lock:
 * - If the lock file does not exist yet, create one with an expiration time and start watching it (see below)
 * - If the lock file already exists
 * -- If it has expired, delete it and restart the process
 * -- If it is active, request releasing the resource by creatin the .release file, then retry locking with an exponential backoff
 *
 * Releasing a lock:
 * Stop the watcher and delete the lock/release files.
 *
 * Watching a lock (performed in every `watchInterval` ms):
 * - If the lock file does not exist anymore, or its created by a different process, stop the watcher
 * - If the lock file still exists
 * -- Update its expiration time
 * -- If a release file exists, call the cancel handler
 *
 * The implementation is based on 'A robust distributed locking algorithm based on Google Cloud Storage' by Hongli Lai (https://www.joyfulbikeshedding.com/blog/2021-05-19-robust-distributed-locking-algorithm-based-on-google-cloud-storage.html).
 */

export interface GCSLockerOptions {
  /**
   * The bucket where the lock file will be created. No need to match the upload destination bucket.
   */
  bucket: Bucket
  /**
   * Maximum time (in milliseconds) to wait for an already existing lock to be released, else deny acquiring the lock.
   */
  acquireLockTimeout?: number
  /**
   * Maximum amount of time (in milliseconds) a lock is considered healthy without being refreshed. When refreshed, expiration will be current time + TTL. If a process unexpectedly ends, lock expiration won't be updated every `watchInterval`, and it will become unhealthy. Must be set according to `watchInterval`, and must be more than it (else would expire before being refreshed). Larger value results more waiting time before releasing an unhealthy lock.
   */
  lockTTL?: number
  /**
   * The amount of time (in milliseconds) to wait between lock file health checks. Must be set according to `lockTTL`, and must be less than `acquireLockTimeout`. Larger value results less queries to GCS.
   */
  watchInterval?: number
}

export class GCSLocker implements Locker {
  events: EventEmitter
  bucket: Bucket
  lockTimeout: number
  lockTTL: number
  watchInterval: number

  constructor(options: GCSLockerOptions) {
    this.events = new EventEmitter()
    this.bucket = options.bucket
    this.lockTimeout = options.acquireLockTimeout ?? 1000 * 30
    this.lockTTL = options.lockTTL ?? 1000 * 12
    this.watchInterval = options.watchInterval ?? 1000 * 10

    if (this.watchInterval < this.lockTimeout) {
      throw new Error('watchInterval must be less than acquireLockTimeout')
    }
  }

  newLock(id: string) {
    return new GCSLockHandler(id, this)
  }
}

class GCSLockHandler implements Lock {
  private gcsLock: GCSLock

  constructor(private id: string, private locker: GCSLocker) {
    this.gcsLock = new GCSLock(
      this.id,
      this.locker.bucket,
      this.locker.lockTTL,
      this.locker.watchInterval
    )
  }

  async lock(requestRelease: RequestRelease): Promise<void> {
    const abortController = new AbortController()

    const lock = await Promise.race([
      this.waitForLockTimeoutOrAbort(abortController.signal),
      this.acquireLock(requestRelease, abortController.signal),
    ])

    abortController.abort()

    if (!lock) {
      throw ERRORS.ERR_LOCK_TIMEOUT
    }
  }

  async unlock(): Promise<void> {
    await this.gcsLock.release()
  }

  protected async acquireLock(
    cancelHandler: RequestRelease,
    signal: AbortSignal,
    attempt = 0
  ): Promise<boolean> {
    if (signal.aborted) {
      return false
    }

    const acquired = await this.gcsLock.take(cancelHandler)

    if (!acquired) {
      //Try to acquire the lock again
      return await new Promise((resolve, reject) => {
        //On the first attempt, retry after current I/O operations are done, else use an exponential backoff
        const waitFn = (then: () => void) =>
          attempt > 0
            ? setTimeout(then, (attempt * this.locker.watchInterval) / 3)
            : setImmediate(then)

        waitFn(() => {
          this.acquireLock(cancelHandler, signal, attempt + 1)
            .then(resolve)
            .catch(reject)
        })
      })
    }

    return true
  }

  protected waitForLockTimeoutOrAbort(signal: AbortSignal) {
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false)
      }, this.locker.lockTimeout)

      const abortListener = () => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abortListener)
        resolve(false)
      }
      signal.addEventListener('abort', abortListener)
    })
  }
}
