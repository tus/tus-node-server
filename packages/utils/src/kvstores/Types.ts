import type {Upload} from '../models/index.js'

export interface KvStore<T = Upload> {
  get(key: string): Promise<T | undefined>
  set(key: string, value: T): Promise<void>
  /** Deletes a key, succeeding if it does not exist. */
  delete(key: string): Promise<void>

  list?(): Promise<Array<string>>
}
