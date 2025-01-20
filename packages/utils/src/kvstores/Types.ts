import type {Upload} from '../models'

export interface KvStore<T = Upload> {
  get(key: string): Promise<T | undefined>
  set(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>

  list?(): Promise<Array<string>>
}
