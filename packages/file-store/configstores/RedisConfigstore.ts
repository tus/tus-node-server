import {RedisClientType} from '@redis/client'

import {Upload} from '@tus/server'
import {Configstore} from './Types'

/**
 * Redis based configstore.
 *
 * @author Mitja Puzigaća <mitjap@gmail.com>
 */
export class RedisConfigstore implements Configstore {
  constructor(private redis: RedisClientType, private prefix: string = '') {
    this.redis = redis
    this.prefix = prefix
  }

  async get(key: string): Promise<Upload | undefined> {
    return this.deserializeValue(await this.redis.get(this.prefix + key))
  }

  async set(key: string, value: Upload): Promise<void> {
    await this.redis.set(this.prefix + key, this.serializeValue(value))
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key)
  }

  async list(): Promise<Array<string>> {
    return this.redis.keys(this.prefix + '*')
  }

  private serializeValue(value: Upload): string {
    return JSON.stringify(value)
  }

  private deserializeValue(buffer: string | null): Upload | undefined {
    return buffer ? JSON.parse(buffer) : undefined
  }
}
