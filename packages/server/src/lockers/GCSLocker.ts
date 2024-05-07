import {ERRORS, Lock, Locker, RequestRelease} from '@tus/utils'
import {Bucket, File} from '@google-cloud/storage'
import EventEmitter from 'node:events'

/**
 * Google Cloud Storage implementation of the Locker mechanism with support for distribution.
 * For general information regarding Locker, see MemoryLocker.
 *
 * Locking is based on separate .lock files created in a GCS bucket (presumably the same as the upload destination, but not necessarily). Locker distribution is accomplished through metadata of the lockfile. After a lock file is created, we regularly check if its metadata was modified by another process (i.e. to request releasing the resource). To avoid resources being locked forever, each lock is created with an expiration time (also stored as metadata).
 *
 * Lock file health - possible states of a lock file:
 * - non-existing (not locked)
 * - active (locked)
 * - requested to be released (locked, but should be released soon)
 * - expired (not locked)
 *
 * Acquiring a lock:
 * - If the lock file does not exist yet, create one with an expiration time and start watching it (see below)
 * - If the lock file already exists
 * -- If it has expired, treat it as non existing and overwrite it
 * -- If it is active, request releasing the resource by updating the lockfile's metadata, then retry locking with an exponential backoff
 *
 * Releasing a lock:
 * Stop the watcher and delete the lock file.
 *
 * Watching a lock (performed in every `watchInterval` ms):
 * - If the lock file does not exist anymore, stop the watcher
 * - If the lock file still exists, fetch its metadata
 * -- If there is a release request in the metadata, call the cancel handler and stop the watcher
 * -- If the lock has expired, call the cancel handler and stop the watcher
 *
 * (The process might be improved by introducing a secondary expiration time which gets updated by each watcher interval. This way we'll immediately know if the process which locked the resource has unexpectedly terminated and the resource should be released. Currently, only the `unlockTimeout` catches this scenario. However, this would introduce way more requests to GCS only for better handling of an extraordinary situation.)
 *
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
   * Maximum lifetime (in milliseconds) of a lock. Processes may unexpectedly quit, we need to make sure resources won't stay locked forever. Make sure this is a safe maximum, else the lock may be released while the resource is still being used.
   */
  unlockTimeout?: number
  /**
   * The amount of time (in milliseconds) to wait between lock file health checks. Larger interval results less requests to GCS, but generally more time to release a locked resource. Must be less than `acquireLockTimeout`.
   */
  watchInterval?: number
}

export class GCSLocker implements Locker {
  events: EventEmitter
  bucket: Bucket
  lockTimeout: number
  unlockTimeout: number
  watchInterval: number

  constructor(options: GCSLockerOptions) {
    this.events = new EventEmitter()
    this.bucket = options.bucket
    this.lockTimeout = options.acquireLockTimeout ?? 1000 * 30
    this.unlockTimeout = options.unlockTimeout ?? 1000 * 600
    this.watchInterval = options.watchInterval ?? 1000 * 10

    if (this.watchInterval < this.lockTimeout) {
      throw new Error('watchInterval must be less than acquireLockTimeout')
    }
  }

  newLock(id: string) {
    return new GCSLock(id, this)
  }
}

class GCSLock implements Lock {
  constructor(private id: string, private locker: GCSLocker) {}

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
    const lockFile = new GCSLockFile(this.locker, this.id)

    if (!(await lockFile.isLocked())) {
      throw new Error('Releasing an unlocked lock!')
    }

    await lockFile.delete()
  }

  protected async acquireLock(
    cancelHandler: RequestRelease,
    signal: AbortSignal,
    attempt = 0
  ): Promise<boolean> {
    if (signal.aborted) {
      return false
    }

    const lockFile = new GCSLockFile(this.locker, this.id)

    if (!(await lockFile.isLocked())) {
      //The id is not locked yet - create a new lock file on GCS, start watching it
      await lockFile.write(cancelHandler)

      return true
    } else {
      //The id is already locked, we need to request releasing the resource
      await lockFile.requestRelease()

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

class GCSLockFile {
  protected fileId: string
  protected lockFile: File
  protected unlockTimeout: number
  protected watchInterval: number
  protected watcher: NodeJS.Timeout | undefined

  constructor(locker: GCSLocker, fileId: string) {
    this.fileId = fileId
    this.lockFile = locker.bucket.file(`${fileId}.lock`)
    this.unlockTimeout = locker.unlockTimeout
    this.watchInterval = locker.watchInterval
  }

  /**
   * Check whether the resource is currently locked or not
   */
  public async isLocked() {
    //Check if file exists
    const exists = (await this.lockFile.exists())[0]
    if (!exists) {
      return false
    }

    //Check if file is not expired
    if (await this.hasExpired()) {
      return false
    }

    return true
  }

  /**
   * Write (create or update) the lockfile and start the watcher
   */
  public async write(cancelHandler: RequestRelease) {
    await this.lockFile.save('', {metadata: {exp: Date.now() + this.unlockTimeout}})

    this.startWatcher(cancelHandler)
  }

  /**
   * Delete the lockfile and stop the watcher
   */
  public async delete() {
    clearInterval(this.watcher)
    await this.lockFile.delete()
  }

  /**
   * Request the release of the related resource
   */
  public async requestRelease() {
    await this.lockFile.setMetadata({unlockRequest: 1})
  }

  /**
   * Check if the lockfile has already expired
   */
  protected async hasExpired(meta?: File['metadata']) {
    if (!meta) {
      try {
        meta = (await this.lockFile.getMetadata())[0]
      } catch (err) {
        return true
      }
    }
    const expDate = Date.parse(meta.timeCreated || '')
    return !expDate || expDate < Date.now()
  }

  /**
   * Start watching a lock file's health
   */
  protected startWatcher(cancelHandler: RequestRelease) {
    this.watcher = setInterval(async () => {
      if ((await this.lockFile.exists())[0]) {
        //Fetch lock metadata
        const meta = await this.lockFile.getMetadata()

        //Unlock if release was requested or unlock timed out
        if ('unlockRequest' in meta || (await this.hasExpired(meta[0]))) {
          cancelHandler()
          clearInterval(this.watcher)
        }
      } else {
        //Lock is freed, terminate watcher
        clearInterval(this.watcher)
      }
    }, this.watchInterval)
  }
}
