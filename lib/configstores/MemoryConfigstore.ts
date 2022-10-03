/**
 * @fileOverview
 * Memory based configstore.
 * Used mostly for unit tests.
 *
 * @author Mitja Puzigaća <mitjap@gmail.com>
 */
class MemoryConfigstore {
  data: any
  constructor() {
    this.data = new Map()
  }
  async get(key: any) {
    let value = this.data.get(key)
    if (value !== undefined) {
      value = JSON.parse(value)
    }
    return value
  }
  async set(key: any, value: any) {
    this.data.set(key, JSON.stringify(value))
  }
  async delete(key: any) {
    return this.data.delete(key)
  }
}
export default MemoryConfigstore
