import type {RedisClientType} from '@redis/client'
import type {KvStore} from './Types'
import type {Upload} from '../models'

/**
 * Redis based configstore.
 *
 * @author Mitja Puzigaća <mitjap@gmail.com>
 */
export class RedisKvStore<T = Upload> implements KvStore<T> {
  constructor(
    private redis: RedisClientType,
    private prefix = ''
  ) {
    this.redis = redis
    this.prefix = prefix
  }

  async get(key: string): Promise<T | undefined> {
    return this.deserializeValue(await this.redis.get(this.prefix + key))
  }

  async set(key: string, value: T): Promise<void> {
    await this.redis.set(this.prefix + key, this.serializeValue(value))
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key)
  }

  async list(): Promise<Array<string>> {
    return this.redis.keys(`${this.prefix}*`)
  }

  private serializeValue(value: T): string {
    return JSON.stringify(value)
  }

  private deserializeValue(buffer: string | null): T | undefined {
    return buffer ? JSON.parse(buffer) : undefined
  }
}
