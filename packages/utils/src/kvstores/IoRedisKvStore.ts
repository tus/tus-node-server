import type {Redis as IoRedis} from 'ioredis'
import type {KvStore} from './Types'
import type {Upload} from '../models'

export class IoRedisKvStore<T = Upload> implements KvStore<T> {
  constructor(
    private redis: IoRedis,
    private prefix = ''
  ) {
    this.redis = redis
    this.prefix = prefix
  }

  private prefixed(key: string): string {
    return `${this.prefix}${key}`
  }

  async get(key: string): Promise<T | undefined> {
    return this.deserializeValue(await this.redis.get(this.prefixed(key)))
  }

  async set(key: string, value: T): Promise<void> {
    await this.redis.set(this.prefixed(key), this.serializeValue(value))
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefixed(key))
  }

  async list(): Promise<Array<string>> {
    const keys = new Set<string>()
    let cursor = '0'
    do {
      const [next, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        this.prefixed('*'),
        'COUNT',
        '20'
      )
      cursor = next
      for (const key of batch) keys.add(key)
    } while (cursor !== '0')
    return Array.from(keys)
  }

  private serializeValue(value: T): string {
    return JSON.stringify(value)
  }

  private deserializeValue(buffer: string | null): T | undefined {
    return buffer ? JSON.parse(buffer) : undefined
  }
}
