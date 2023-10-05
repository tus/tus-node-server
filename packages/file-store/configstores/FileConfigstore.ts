import fs from 'node:fs/promises'
import path from 'node:path'
import {Upload} from '@tus/server'
import PQueue from 'p-queue'

import {Configstore} from './Types'

/**
 * FileConfigstore writes the `Upload` JSON metadata to disk next the uploaded file itself.
 * It uses a queue which only processes one operation at a time to prevent unsafe concurrent access.
 */
export class FileConfigstore implements Configstore {
  directory: string
  queue: PQueue

  constructor(path: string) {
    this.directory = path
    this.queue = new PQueue({concurrency: 1})
  }

  async get(key: string): Promise<Upload | undefined> {
    try {
      const buffer = await this.queue.add(() => fs.readFile(this.resolve(key), 'utf8'))
      return JSON.parse(buffer as string)
    } catch {
      return undefined
    }
  }

  async set(key: string, value: Upload): Promise<void> {
    await this.queue.add(() => fs.writeFile(this.resolve(key), JSON.stringify(value)))
  }

  async delete(key: string): Promise<void> {
    await this.queue.add(() => fs.rm(this.resolve(key)))
  }

  async list(): Promise<Array<string>> {
    return this.queue.add(async () => {
      const files = await fs.readdir(this.directory)
      return Array.from(new Set(files))
    })
  }

  private resolve(key: string): string {
    return path.resolve(this.directory, `${key}.json`)
  }
}
