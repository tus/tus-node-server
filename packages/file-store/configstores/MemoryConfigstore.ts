import {Upload} from '@tus/server'
import {Configstore} from './Types'

/**
 * Memory based configstore.
 * Used mostly for unit tests.
 *
 * @author Mitja Puzigaća <mitjap@gmail.com>
 */
export class MemoryConfigstore implements Configstore {
  data: Map<string, string> = new Map()

  async get(key: string): Promise<Upload | undefined> {
    return this.deserializeValue(this.data.get(key))
  }

  async set(key: string, value: Upload): Promise<void> {
    this.data.set(key, this.serializeValue(value))
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  async list(): Promise<Array<string>> {
    return [...this.data.keys()]
  }

  private serializeValue(value: Upload): string {
    return JSON.stringify(value)
  }

  private deserializeValue(buffer: string | undefined): Upload | undefined {
    return buffer ? new Upload(JSON.parse(buffer)) : undefined
  }
}
