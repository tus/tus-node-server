import fs from 'node:fs/promises'
import {Upload} from '@tus/server'

import {Configstore} from './Types'

export class FileConfigstore implements Configstore {
  directory: string

  constructor(path: string) {
    this.directory = path
  }

  async get(key: string): Promise<Upload> {
    const buffer = await fs.readFile(this.resolve(key), 'utf8')
    return JSON.parse(buffer)
  }

  async set(key: string, value: Upload): Promise<void> {
    await fs.writeFile(this.resolve(key), JSON.stringify(value))
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key))
  }

  async list(): Promise<Array<string>> {
    const files = await fs.readdir(this.directory, {withFileTypes: true})
    const infoFiles = files.filter((file) => file.isFile() && file.name.endsWith('.info'))
    const promises = infoFiles.map((file) =>
      // extension is included in the file name.
      fs.readFile(`${this.directory}/${file}`, 'utf8')
    )

    return Promise.all(promises)
  }

  private resolve(key: string): string {
    return `${this.directory}/${key}.info`
  }
}
