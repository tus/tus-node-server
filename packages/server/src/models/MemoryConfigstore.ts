import type {Upload} from '../models'

/**
 * Memory based configstore.
 * Used mostly for unit tests.
 *
 * @author Mitja Puzigaća <mitjap@gmail.com>
 */
export class MemoryConfigstore {
  data: Map<string, Upload> = new Map()

  get(key: string): Upload | undefined {
    return this.data.get(key)
  }

  set(key: string, value: Upload) {
    this.data.set(key, value)
  }

  delete(key: string) {
    this.data.delete(key)
  }

  all(): Record<string, Upload> {
    return Object.fromEntries(this.data.entries())
  }
}
