import type {Lock, Locker} from '@tus/utils'
import type {Redis} from 'ioredis'
import {
  EXTEND_SCRIPT,
  type LockClient,
  RELEASE_SCRIPT,
  RedisLockEngine,
} from './RedisLockEngine.js'

/**
 * IoRedisLocker is a distributed Locker backed by the ioredis client, often considered a superior choice for scalable projects
 * It is a wrapper that adapts ioredis to the shared {@link RedisLockEngine} where the actual lock state machine lives
 *
 * @param {Redis} ioredis used for Redis I/O operations like storing lock data and publishing unlock requests
 * @param {Redis} subscriber used exclusively for Redis subscription capabilities to receive unlock requests
 * @param {number} [acquireLockTimeout] determines max wait time for a busy lock to unlock - it is recommended to keep this number greater than or equal to `redisLockTimeout` (default=30000ms)
 * @param {number} [acquireLockRetry] in order not to bombard Redis with constant requests to acquire the lock, a retry delay is used. Still it is recommended to keep the number low (default=100ms)
 * @param {number} [redisLockTimeout] the TTL of the lock on Redis (default=30000)
 * @param {string} [prefix] prefix for the stored keys - can be the same as `subPrefix`, although it is recommended to set different values (default="lock")
 * @param {string} [subPrefix] prefix for Sub/Pub (default="lock:release")
 */
export interface IoRedisLockerOptions {
  ioredis: Redis
  subscriber: Redis
  acquireLockTimeout?: number
  acquireLockRetry?: number
  redisLockTimeout?: number
  prefix?: string
  subPrefix?: string
}

/**
 * Adapts the ioredis client to the engine's {@link LockClient} surface
 *
 * ioredis uses a single global `message` emitter rather than per-channel listeners, so we keep a map of channel to handler and dispatch through it
 * subscribe returns a cleanup that removes the handler and unsubscribes the channel
 */
class IoRedisClient implements LockClient {
  private releaseHandlers = new Map<string, () => void>()

  constructor(
    private ioredis: Redis,
    private subscriber: Redis
  ) {
    this.subscriber.on('message', (channel: string) => {
      this.releaseHandlers.get(channel)?.()
    })
  }

  async tryAcquire(key: string, token: string, ttlMs: number): Promise<boolean> {
    // Sets only if the key does not exist yet. Returns null when the key is already held
    const res = await this.ioredis.set(key, token, 'PX', ttlMs, 'NX')
    return !!res
  }

  async extend(key: string, token: string, ttlMs: number): Promise<boolean> {
    const extended = (await this.ioredis.eval(
      EXTEND_SCRIPT,
      1,
      key,
      token,
      ttlMs.toString()
    )) as number
    return extended === 1
  }

  async release(key: string, token: string): Promise<void> {
    await this.ioredis.eval(RELEASE_SCRIPT, 1, key, token)
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.ioredis.publish(channel, message)
  }

  async subscribe(channel: string, onMessage: () => void): Promise<() => Promise<void>> {
    this.releaseHandlers.set(channel, onMessage)
    await this.subscriber.subscribe(channel)
    return async () => {
      this.releaseHandlers.delete(channel)
      await this.subscriber.unsubscribe(channel)
    }
  }
}

/**
 * Distributed locker which uses the ioredis client under the hood, considered better for scalability
 *
 * @author Oleg Mykula <oleg.mukula@gmail.com>
 */
export class IoRedisLocker implements Locker {
  private engine: RedisLockEngine

  constructor(options: IoRedisLockerOptions) {
    this.engine = new RedisLockEngine({
      client: new IoRedisClient(options.ioredis, options.subscriber),
      acquireLockTimeout: options.acquireLockTimeout,
      acquireLockRetry: options.acquireLockRetry,
      redisLockTimeout: options.redisLockTimeout,
      prefix: options.prefix,
      subPrefix: options.subPrefix,
    })
  }

  newLock(id: string): Lock {
    return this.engine.newLock(id)
  }
}
