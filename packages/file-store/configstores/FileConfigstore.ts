import Store, {ConfigstoreOptions} from 'configstore'

import {Upload} from '@tus/server/src'
import {Configstore} from './types'
import pkg from '../package.json'

export class FileConfigstore implements Configstore {
  db: Store

  constructor(packageName?: string, options?: ConfigstoreOptions) {
    if (!packageName) {
      packageName = `${pkg.name}-${pkg.version}`
    }
    this.db = new Store(packageName, undefined, options)
  }

  async get(key: string): Promise<Upload | undefined> {
    return this.db.get(this.encodeKey(key))
  }

  async set(key: string, value: Upload): Promise<void> {
    this.db.set(this.encodeKey(key), value)
  }

  async delete(key: string): Promise<void> {
    this.db.delete(this.encodeKey(key))
  }

  async list(): Promise<Array<string>> {
    return Object.keys(this.db.all).map(this.decodeKey)
  }

  /**
   * Key needs to be encoded due to configstore's support for dot notation.
   * @param key to be encoded
   * @returns base64-encoded key
   */
  private encodeKey(key: string): string {
    return Buffer.from(key).toString('base64')
  }

  /**
   * Key to be decoded
   * @param key base64-encoded key
   * @returns decoded key
   */
  private decodeKey(key: string): string {
    return Buffer.from(key, 'base64').toString('utf-8')
  }
}
