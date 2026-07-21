import type {RedisClientType} from '@redis/client'
import type {PubSubListener} from '@redis/client/dist/lib/client/pub-sub.js'
import type {Locker} from '@tus/utils'
import {
  EXTEND_SCRIPT,
  type LockClient,
  RELEASE_SCRIPT,
  RedisLockEngine,
} from './RedisLockEngine.js'

/**
 * NodeRedisLocker is a distributed Locker backed by the node-redis client
 * It is a thin wrapper that adapts node-redis to the shared {@link RedisLockEngine} where the actual lock state machine lives
 *
 * @author Oleg Mykula <oleg.mukula@gmail.com>
 *
 * @param {RedisClientType} redis used for Redis I/O operations like storing lock data and publishing unlock requests
 * @param {RedisClientType} subscriber used exclusively for Redis subscription capabilities to receive unlock requests
 * @param {number} [acquireLockTimeout] determines max wait time for a busy lock to unlock - it is recommended to keep this number greater than or equal to `redisLockTimeout` (default=30000ms)
 * @param {number} [acquireLockRetry] in order not to bombard Redis with constant requests to acquire the lock, a retry delay is used. Still it is recommended to keep the number low (default=100ms)
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
 * Adapts the node-redis client to the engine's {@link LockClient} surface
 * node-redis takes a per-channel listener, so subscribe returns a cleanup that unsubscribes that same listener
 */
class NodeRedisClient implements LockClient {
  constructor(
    private redis: RedisClientType,
    private subscriber: RedisClientType
  ) {}

  async tryAcquire(key: string, token: string, ttlMs: number): Promise<boolean> {
    // Sets only if the key does not exist yet. Returns null when the key is already held
    const res = await this.redis.set(key, token, {
      condition: 'NX',
      expiration: {type: 'PX', value: ttlMs},
    })
    return res !== null
  }

  async extend(key: string, token: string, ttlMs: number): Promise<boolean> {
    const extended = (await this.redis.eval(EXTEND_SCRIPT, {
      keys: [key],
      arguments: [token, ttlMs.toString()],
    })) as number
    return extended === 1
  }

  async release(key: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, {keys: [key], arguments: [token]})
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.redis.publish(channel, message)
  }

  async subscribe(channel: string, onMessage: () => void): Promise<() => Promise<void>> {
    const listener: PubSubListener = () => onMessage()
    await this.subscriber.subscribe(channel, listener)
    return async () => {
      await this.subscriber.unsubscribe(channel, listener)
    }
  }
}

/**
 * Distributed locker which uses the node-redis client under the hood
 *
 * @author Oleg Mykula <oleg.mukula@gmail.com>
 */
export class NodeRedisLocker implements Locker {
  private engine: RedisLockEngine

  constructor(options: RedisLockerOptions) {
    this.engine = new RedisLockEngine({
      client: new NodeRedisClient(options.redis, options.subscriber),
      acquireLockTimeout: options.acquireLockTimeout,
      acquireLockRetry: options.acquireLockRetry,
      redisLockTimeout: options.redisLockTimeout,
      prefix: options.prefix,
      subPrefix: options.subPrefix,
    })
  }

  newLock(id: string) {
    return this.engine.newLock(id)
  }
}
