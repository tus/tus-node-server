import fs from 'node:fs/promises'
import path from 'node:path'

import type {KvStore} from './Types.js'
import type {Upload} from '../models/index.js'
import {ERRORS} from '../constants.js'
import {isPathInsideDirectory} from '../path.js'

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
    const files = new Set(await fs.readdir(this.directory))
    // To only return tus file IDs we check if the file has a corresponding JSON info file
    return [...files].filter((file) => files.has(`${file}.json`)).sort()
  }

  private resolve(key: string): string {
    const filePath = path.resolve(this.directory, `${key}.json`)
    if (!isPathInsideDirectory(this.directory, filePath)) {
      throw ERRORS.FILE_NOT_FOUND
    }
    return filePath
  }
}
