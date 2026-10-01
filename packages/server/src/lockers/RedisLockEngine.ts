import {randomUUID} from 'node:crypto'
import {ERRORS, type Lock, type Locker, type RequestRelease} from '@tus/utils'

/**
 * Safely releases the lock, used when giving up ownership
 *
 * KEYS[1] = lock key, ARGV[1] = the caller's token
 *
 * Deletes the key only if its current value still equals our token, so we are still the owner
 * This guards against the case where our TTL expired and another request/process acquired the same id in the meantime
 * Calling a DEL here would delete their lock and break mutex
 * The GET and DEL run as a single atomic unit on the server, so no one can take over in between the check and the delete
 *
 * Returns 1 if the lock was ours and deleted, 0 otherwise
 */
export const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`

/**
 * Same idea as with the RELEASE_SCRIPT, but this script safely extends lock's TTL, used by the watchdog to keep a long-running lock alive
 *
 * KEYS[1] = lock key, ARGV[1] = the caller's token, ARGV[2] = new TTL in ms
 *
 * The script updates the lock's TTL only if the key still holds our UUID
 * If our TTL is already over and someone else took over the ID, this must NOT modify key's TTL, preventing us from hijacking a lock we dont own
 *
 * Returns 1 if the TTL was extended, 0 if the lock is no longer ours
 */
export const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`

/**
 * Client-agnostic surface the lock engine drives
 * Each Redis client (node-redis, ioredis) provides its own adapter so the lock state machine lives in one place
 *
 * - `tryAcquire` runs `SET NX PX` and returns whether we won the key
 * - `extend` runs the compare-and-extend script and returns whether the TTL was renewed
 * - `release` runs the compare-and-delete script. It must be safe to call even if we no longer own the key
 * - `publish` nudges the current holder over pub/sub
 * - `subscribe` starts listening on a channel and returns a cleanup function that stops listening
 */
export interface LockClient {
  tryAcquire(key: string, token: string, ttlMs: number): Promise<boolean>
  extend(key: string, token: string, ttlMs: number): Promise<boolean>
  release(key: string, token: string): Promise<void>
  publish(channel: string, message: string): Promise<void>
  subscribe(channel: string, onMessage: () => void): Promise<() => Promise<void>>
}

export interface RedisLockEngineOptions {
  client: LockClient
  acquireLockTimeout?: number
  acquireLockRetry?: number
  redisLockTimeout?: number
  prefix?: string
  subPrefix?: string
}

/**
 * RedisLockEngine holds the distributed lock state machine shared by NodeRedisLocker and IoRedisLocker
 * It coordinates exclusive access to uploads across multiple processes or servers, which is required when the tus server is horizontally scaled
 * This engine allows you to build custom handlers if @redis/node or ioredis don't satisfy your needs
 *
 * How it works:
 * - Each lock is a Redis key claimed by `SET NX PX`, holding a unique token (UUID) that proves ownership in case conflict ever arises from, for example, two different processes
 * - The `cancelReq` signal is delivered over Redis Pub/Sub, and a contender publishes on the resource's release channel
 *   The current holder is subscribed and runs its `cancelReq` callback, encouraging it to release as soon as possible
 * - The key carries a TTL so a crashed holder's lock is eventually reclaimed, and a watchdog extends the TTL while the lock is actively held, ensuring crash safety
 *
 * This is a single-instance lock. The small window in which a stalled holder can lose its lock to another request is prevented by PatchHandler's upload-offset validation
 *
 * @author Oleg Mykula <oleg.mukula@gmail.com>
 */
export class RedisLockEngine implements Locker {
  private client: LockClient
  private timeout: number
  private retryDelay: number
  private lockTimeout: number
  private prefix: string
  private subPrefix: string

  constructor(options: RedisLockEngineOptions) {
    this.client = options.client
    this.timeout = options.acquireLockTimeout ?? 1000 * 30
    this.retryDelay = options.acquireLockRetry ?? 100
    this.lockTimeout = options.redisLockTimeout ?? 1000 * 30
    this.prefix = options.prefix ?? 'lock'
    this.subPrefix = options.subPrefix ?? 'lock:release'
  }

  newLock(id: string): Lock {
    return new RedisEngineLock({
      key: this.key(id),
      channel: this.channel(id),
      client: this.client,
      timeout: this.timeout,
      retryDelay: this.retryDelay,
      lockTimeout: this.lockTimeout,
    })
  }

  /**
   * Identifier for a Redis key based on upload ID
   */
  key(id: string) {
    return `${this.prefix}:${id}`
  }

  /**
   * Identifier for a Redis pub/sub channel based on upload ID
   */
  channel(id: string) {
    return `${this.subPrefix}:${id}`
  }
}

interface RedisEngineLockConfig {
  key: string
  channel: string
  client: LockClient
  timeout: number
  retryDelay: number
  lockTimeout: number
}

class RedisEngineLock implements Lock {
  /**
   * Used to distinguish between different processes and to determine whether a different process took over an ID
   */
  private token = randomUUID()
  /**
   * Stores a NodeJS Interval that periodically extends the TTL of a lock should it need it
   */
  private watchdog?: NodeJS.Timeout
  /**
   * Stops the pub/sub subscription for this lock. Set once we are subscribed and cleared once released. This function is client's `subscribe()` implementation return value
   */
  private cleanup?: () => Promise<void>
  /**
   * Whether we currently hold a live, fully set-up lock. Guards unlock against releasing something we never took
   */
  private acquired = false

  constructor(private config: RedisEngineLockConfig) {}

  async lock(stopSignal: AbortSignal, requestRelease: RequestRelease): Promise<void> {
    const {client, key, channel, lockTimeout, retryDelay} = this.config
    const deadline = Date.now() + this.config.timeout

    while (!stopSignal.aborted && Date.now() < deadline) {
      if (await client.tryAcquire(key, this.token, lockTimeout)) {
        const onMessage = () => {
          void Promise.resolve(requestRelease()).catch(() => {})
        }

        try {
          this.cleanup = await client.subscribe(channel, onMessage)
        } catch (err) {
          // We own the key but could not subscribe. Release it so it isnt held until its TTL expires
          await client.release(key, this.token).catch(() => {})
          throw err
        }

        // We may have been aborted or run out of time while tryAcquire and subscribe were in flight
        // Roll back the ownership we just took instead of leaving an orphaned lock behind
        if (stopSignal.aborted || Date.now() >= deadline) {
          await this.releaseOwnership()
          break
        }

        this.acquired = true
        this.startWatchdog(requestRelease)
        return
      }

      await client.publish(channel, 'if you aint gonna play pass the controller')
      await this.sleep(retryDelay, stopSignal)
    }

    throw ERRORS.ERR_LOCK_TIMEOUT
  }

  async unlock(): Promise<void> {
    if (!this.acquired) {
      throw new Error('Releasing an unlocked lock!')
    }
    this.acquired = false

    if (this.watchdog) {
      clearInterval(this.watchdog)
      this.watchdog = undefined
    }

    await this.releaseOwnership()
  }

  /**
   * Unsubscribes then deletes the hold key
   * The release runs in a `finally` so a failed unsubscribe still gives up ownership instead of occupying the lock until its TTL
   */
  private async releaseOwnership(): Promise<void> {
    const cleanup = this.cleanup
    this.cleanup = undefined
    try {
      if (cleanup) {
        await cleanup()
      }
    } finally {
      await this.config.client.release(this.config.key, this.token)
    }
  }

  /**
   * Extends the lock's TTL on Redis every half of `lockTimeout` given that we still own the lock and it has not been unlocked
   * Otherwise aborts
   */
  private startWatchdog(requestRelease: RequestRelease) {
    const {client, key, lockTimeout} = this.config
    const interval = Math.floor(lockTimeout / 2)

    this.watchdog = setInterval(async () => {
      try {
        const extended = await client.extend(key, this.token, lockTimeout)

        if (!extended) {
          // Because our TTL has elapsed and another request took over the id, we no longer own it
          // Stop renewing and ask our own request to abort so it stops writing
          // The handler's `finally` then calls unlock() to unsubscribe and run the (harmless, no-op) compare-and-delete
          if (this.watchdog) {
            clearInterval(this.watchdog)
            this.watchdog = undefined
          }
          void Promise.resolve(requestRelease()).catch(() => {})
        }
      } catch {
        // The key may still hold plenty of TTL, so we do not surrender the lock over a failed request. The next tick will retry
      }
    }, interval)
    this.watchdog.unref()
  }

  /**
   * Waits `ms`, or resolves early if the signal aborts so the acquire loop can end promptly
   */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      const onAbort = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      signal.addEventListener('abort', onAbort, {once: true})
    })
  }
}
