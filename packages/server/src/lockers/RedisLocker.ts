import {randomUUID} from 'node:crypto'
import type {RedisClientType} from '@redis/client'
import type {PubSubListener} from '@redis/client/dist/lib/client/pub-sub.js'
import {ERRORS, type Lock, type Locker, type RequestRelease} from '@tus/utils'

/**
 * RedisLocker is a distributed implementation of the Locker interface, managed by Redis.
 * It coordinates exclusive access to uploads across multiple processes or servers, which is required when the tus server is horizontally scaled.
 *
 * How it works:
 * - Each lock is a Redis key claimed by `SET NX PX`, holding a unique token (UUID) that proves ownership in case conflict ever arises from, for example, two different processes.
 * - The `cancelReq` signal is delivered over Redis Pub/Sub, and a contender publishes on the resource's release channel.
 *   The current holder is subscribed and runs its `cancelReq` callback, encouraging it to release as soon as possible.
 * - The key carries a TTL so a crashed holder's lock is eventually reclaimed, and a watchdog extends the TTL while the lock is actively held, ensuring crash safety.
 *
 * This is a single-instance lock. The small window in which a stalled holder can lose its lock to another request is prevented by PatchHandler's upload-offset validation.
 *
 * @author Oleg Mykula <oleg.mukula@gmail.com>
 *
 * @param {RedisClientType} redis used for Redis I/O operations like storing lock data and publishing unlock requests.
 * @param {RedisClientType} subscriber used exclusively for Redis subscription capabilities to receive unlock requests.
 * @param {number} [acquireLockTimeout] determines max wait time for a busy lock to unlock - it is recommended to keep this number greater than or equal to `redisLockTimeout` (default=30000ms).
 * @param {number} [acquireLockRetry] in order not to bombard Redis with constant request to acquire the lock, Timeout was implemented for this Redis Locker. Still it is recommended to keep the number low (default=100ms).
 * @param {number} [redisLockTimeout] the TTL of the lock on Redis (default=30000)
 * @param {string} [prefix] prefix for the stored keys - can be the same as `subPrefix`, although it is recommended to set different values (default="lock")
 * @param {string} [subPrefix] prefix for Sub/Pub (default="lock:release")
 */

export interface RedisLockerOptions {
  redis: RedisClientType
  subscriber: RedisClientType
  acquireLockTimeout?: number
  acquireLockRetry?: number
  redisLockTimeout?: number
  prefix?: string
  subPrefix?: string
}

/**
 * Safely releases the lock, used by `unlock()`.
 *
 * KEYS[1] = lock key, ARGV[1] = the caller's token.
 *
 * Deletes the key only if its current value still equals our token, so we are still the owner.
 * This guards against the case where our TTL expired and another request/process acquired the same id in the meantime.
 * Calling a DEL here would delete their lock and break mutex.
 * The GET and DEL run as a single atomic unit on the server, so no one can take over in between the check and the delete.
 *
 * Returns 1 if the lock was ours and deleted, 0 otherwise.
 */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`

/**
 * Same idea as with the RELEASE_SCRIPT, but this script safely extends lock's TTL, used by `watchdog` to keep a long-running lock alive.
 *
 * KEYS[1] = lock key, ARGV[1] = the caller's token, ARGV[2] = new TTL in ms.
 *
 * The script updates the lock's TTL only if the key still holds our UUID.
 * If our TTL is already over and someone else took over the ID, this must NOT modify key's TTL, preventing us from hijacking a lock we dont own
 *
 * Returns 1 if the TTL was extended, 0 if the lock is no longer ours
 */
const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`

/**
 * @author Oleg Mykula <oleg.mukula@gmail.com>
 */
export class RedisLocker implements Locker {
  redis: RedisClientType
  subscriber: RedisClientType
  timeout: number
  retryDelay: number
  lockTimeout: number
  prefix: string
  subPrefix: string

  constructor(options: RedisLockerOptions) {
    this.redis = options.redis
    this.subscriber = options.subscriber
    this.timeout = options.acquireLockTimeout ?? 1000 * 30
    this.retryDelay = options.acquireLockRetry ?? 100
    this.lockTimeout = options.redisLockTimeout ?? 1000 * 30
    this.prefix = options.prefix ?? 'lock'
    this.subPrefix = options.subPrefix ?? 'lock:release'
  }

  newLock(id: string) {
    return new RedisLock(id, this, this.timeout)
  }

  /**
   * Identifier for a Redis key based on upload ID.
   */
  key(id: string) {
    return `${this.prefix}:${id}`
  }

  /**
   * Identifier for a Redis pub/sub channel based on upload ID.
   */
  channel(id: string) {
    return `${this.subPrefix}:${id}`
  }
}

class RedisLock implements Lock {
  /**
   * Used to distinguish between different processes and to determine whether a different process took over an ID.
   */
  private token = randomUUID()
  /**
   * Stores a callback which is invoked upon receiving a message from a Redis channel.
   */
  private listener?: PubSubListener
  /**
   * Stores a NodeJS Interval that periodically extends the TTL of a lock should it need it.
   */
  private watchdog?: NodeJS.Timeout

  constructor(
    private id: string,
    private locker: RedisLocker,
    private timeout: number = 1000 * 30
  ) {}

  async lock(stopSignal: AbortSignal, requestRelease: RequestRelease): Promise<void> {
    const abortController = new AbortController()
    const onAbort = () => {
      abortController.abort()
    }
    stopSignal.addEventListener('abort', onAbort)

    try {
      const lock = await Promise.race([
        this.waitTimeout(abortController.signal),
        this.acquireLock(this.id, requestRelease, abortController.signal),
      ])

      if (!lock) {
        throw ERRORS.ERR_LOCK_TIMEOUT
      }
    } finally {
      stopSignal.removeEventListener('abort', onAbort)
      abortController.abort()
    }
  }

  protected async acquireLock(
    id: string,
    requestRelease: RequestRelease,
    signal: AbortSignal
  ): Promise<boolean> {
    if (signal.aborted) {
      return false
    }

    // Sets only if the key does not exist yet.
    const lock = await this.locker.redis.set(this.locker.key(id), this.token, {
      condition: 'NX',
      expiration: {
        type: 'PX',
        value: this.locker.lockTimeout,
      },
    })

    if (lock) {
      const {subscriber} = this.locker

      // Stores the requestRelease callback which later gets invoked once a message from Redis is received.
      this.listener = () => {
        void Promise.resolve(requestRelease()).catch(() => {})
      }
      await subscriber.subscribe(this.locker.channel(id), this.listener)

      this.startWatchdog(id, requestRelease)
      return true
    }

    await this.locker.redis.publish(
      this.locker.channel(this.id),
      'if you aint gonna play pass the controller'
    )

    return await new Promise((resolve, reject) => {
      setTimeout(() => {
        this.acquireLock(id, requestRelease, signal).then(resolve).catch(reject)
      }, this.locker.retryDelay)
    })
  }

  async unlock(): Promise<void> {
    if (!this.listener) {
      throw new Error('Releasing an unlocked lock!')
    }

    if (this.watchdog) {
      clearInterval(this.watchdog)
      this.watchdog = undefined
    }

    const {subscriber} = this.locker
    await subscriber.unsubscribe(this.locker.channel(this.id), this.listener)
    this.listener = undefined

    await this.locker.redis.eval(RELEASE_SCRIPT, {
      keys: [this.locker.key(this.id)],
      arguments: [this.token],
    })
  }

  /**
   * Extends the locks TTL on Redis every half of `lockTimeout` value given that we still own the lock and it has not been unlocked.
   * Otherwise aborts.
   */
  private startWatchdog(id: string, requestRelease: RequestRelease) {
    const interval = Math.floor(this.locker.lockTimeout / 2)

    this.watchdog = setInterval(async () => {
      try {
        const extended = await this.locker.redis.eval(EXTEND_SCRIPT, {
          keys: [this.locker.key(id)],
          arguments: [this.token, this.locker.lockTimeout.toString()],
        })

        if (extended === 0) {
          // Because our TTL lapsed and another request took over the id, we no longer own it.
          // Stop renewing and ask our own request to abort so it stops writing.
          // The handler's `finally` then calls unlock() to unsubscribe and run the (harmless, no-op) compare-and-delete.
          if (this.watchdog) {
            clearInterval(this.watchdog)
            this.watchdog = undefined
          }
          void Promise.resolve(requestRelease()).catch(() => {})
        }
      } catch {
        // The key may still hold plenty of TTL, so we do not surrender the lock over a failed request. The next tick retries.
      }
    }, interval)
    this.watchdog.unref()
  }

  protected waitTimeout(signal: AbortSignal) {
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false)
      }, this.timeout)

      const abortListener = () => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abortListener)
        resolve(false)
      }
      signal.addEventListener('abort', abortListener)
    })
  }
}
