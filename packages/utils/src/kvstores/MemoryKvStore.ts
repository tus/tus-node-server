import type {Upload} from '../models'
import type {KvStore} from './Types'

/**
 * Memory based configstore.
 * Used mostly for unit tests.
 */
export class MemoryKvStore<T = Upload> implements KvStore<T> {
  data: Map<string, T> = new Map()

  async get(key: string): Promise<T | undefined> {
    return this.data.get(key)
  }

  async set(key: string, value: T): Promise<void> {
    this.data.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  async list(): Promise<Array<string>> {
    return [...this.data.keys()]
  }
}
