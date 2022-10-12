import type {File} from '../../types'

/**
 * Memory based configstore.
 * Used mostly for unit tests.
 *
 * @author Mitja Puzigaća <mitjap@gmail.com>
 */
export default class MemoryConfigstore {
  data: Map<string, File> = new Map()

  get(key: string): File | undefined {
    return this.data.get(key)
  }

  set(key: string, value: File) {
    this.data.set(key, value)
  }

  async delete(key: string) {
    return this.data.delete(key)
  }
}
