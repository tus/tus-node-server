import type {RequestRelease} from '@tus/utils'
import type {Bucket} from '@google-cloud/storage'
import GCSLockFile, {type FileMetadata} from './GCSLockFile'
import debug from 'debug'

const log = debug('tus-node-server:lockers:gcs')

/**
 * Handles interaction with a lock.
 */
export default class GCSLock {
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

      log('lock acquired and started watcher')

      return true
    } catch (err) {
      log('failed creating lock file', err.code, err.message)
      //Probably lock is already taken
      const isHealthy = await this.insureHealth()

      if (!isHealthy) {
        log('lock not healthy, returning')
        return false
      }
      //Lock is still healthy, request release
      await this.file.requestRelease()

      return false
    }
  }

  /**
   * Release the lock - clear watcher and delete the file.
   */
  public async release() {
    //Clear watcher
    clearInterval(this.watcher)

    //Delete the lock file
    await this.file.deleteOwn()
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
        await this.file.deleteUnhealthy(meta.metageneration as number)
        log('insureHealth deleted unhealthy')

        return false
      }
    } catch (err) {
      log('insureHealth err', err)
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
      log('watcher interval')
      const handleError = () => {
        //Probably the watched lock is freed, terminate watcher
        clearInterval(this.watcher)
      }

      this.file.checkOwnReleaseRequest().then((shouldRelease) => {
        log('watcher shouldRelease', shouldRelease)
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
  protected hasExpired(meta: FileMetadata) {
    const date = Number.parseInt(meta.metadata.exp, 10)
    return !date || date < Date.now()
  }
}
