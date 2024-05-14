import {RequestRelease} from '@tus/utils'
import {Bucket} from '@google-cloud/storage'
import GCSLockFile, {GCSLockFileMetadata} from './GCSLockFile'

/**
 * Handles interaction with a lock.
 */
class GCSLock {
  protected resourceId: string
  protected file: GCSLockFile
  protected ttl: number
  protected watchInterval: number
  protected watcher: NodeJS.Timeout | undefined

  constructor(
    resourceId: string,
    lockBucket: Bucket,
    ttl: number,
    watchInterval: number
  ) {
    this.resourceId = resourceId
    this.file = new GCSLockFile(lockBucket, `${resourceId}.lock`)
    this.ttl = ttl
    this.watchInterval = watchInterval
  }

  /**
   * Try to create the lockfile and start the watcher. If lock is already taken, requests for release and returns FALSE.
   */
  public async take(cancelHandler: RequestRelease): Promise<boolean> {
    try {
      //Try to create lock file
      const exp = Date.now() + this.ttl
      await this.file.create(exp)

      //Lock acquired, start watcher
      this.startWatcher(cancelHandler)

      return true
    } catch (err) {
      //Probably lock is already taken
      const isHealthy = await this.insureHealth()

      if (!isHealthy) {
        //Lock is not healthy, restart the process
        return await this.take(cancelHandler)
      } else {
        //Lock is still healthy, request release
        await this.file.requestRelease()

        return false
      }
    }
  }

  /**
   * Release the lock - clear watcher and delete the file.
   */
  public async release() {
    //Clear watcher
    clearInterval(this.watcher)

    //Delete the lock file
    this.file.deleteOwn()
  }

  /**
   * Check if the lock is healthy, delete if not.
   * Returns TRUE if the lock is healthy.
   */
  protected async insureHealth() {
    try {
      const meta = await this.file.getMeta()

      if (this.hasExpired(meta)) {
        //TTL expired, delete unhealthy lock
        await this.file.deleteUnhealthy(meta.metageneration)

        return false
      }
    } catch (err) {
      //Probably lock does not exist (anymore)
      return false
    }

    return true
  }

  /**
   * Start watching the lock file - keep it healthy and handle release requests.
   */
  protected startWatcher(cancelHandler: RequestRelease) {
    this.watcher = setInterval(() => {
      const handleError = () => {
        //Probably the watched lock is freed, terminate watcher
        clearInterval(this.watcher)
      }

      this.file.checkOwnReleaseRequest().then((shouldRelease) => {
        if (shouldRelease) {
          cancelHandler()
        }

        //Update TTL to keep the lock healthy
        const exp = Date.now() + this.ttl
        this.file.refreshOwn(exp).catch(handleError)
      }, handleError)
    }, this.watchInterval)
  }

  /**
   * Compare lock expiration timestamp with the current time.
   */
  protected hasExpired(meta: GCSLockFileMetadata) {
    const expDate = Date.parse(meta.exp + '')
    return !expDate || expDate < Date.now()
  }
}

export default GCSLock
