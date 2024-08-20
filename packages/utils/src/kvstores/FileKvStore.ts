import fs from 'node:fs/promises'
import path from 'node:path'

import type {KvStore} from './Types'
import type {Upload} from '../models'

/**
 * FileConfigstore writes the `Upload` JSON metadata to disk next the uploaded file itself.
 * It uses a queue which only processes one operation at a time to prevent unsafe concurrent access.
 */
export class FileKvStore<T = Upload> implements KvStore<T> {
  directory: string

  constructor(path: string) {
    this.directory = path
  }

  async get(key: string): Promise<T | undefined> {
    try {
      const buffer = await fs.readFile(this.resolve(key), 'utf8')
      return JSON.parse(buffer as string)
    } catch {
      return undefined
    }
  }

  async set(key: string, value: T): Promise<void> {
    await fs.writeFile(this.resolve(key), JSON.stringify(value))
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key))
  }

  async list(): Promise<Array<string>> {
    const files = await fs.readdir(this.directory)
    const sorted = files.sort((a, b) => a.localeCompare(b))
    const name = (file: string) => path.basename(file, '.json')
    // To only return tus file IDs we check if the file has a corresponding JSON info file
    return sorted.filter(
      (file, idx) => idx < sorted.length - 1 && name(file) === name(sorted[idx + 1])
    )
  }

  private resolve(key: string): string {
    return path.resolve(this.directory, `${key}.json`)
  }
}
