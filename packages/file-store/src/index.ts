// TODO: use /promises versions
import fs from 'node:fs'
import fsProm from 'node:fs/promises'
import path from 'node:path'
import stream from 'node:stream'
import type http from 'node:http'

import debug from 'debug'

import {type Configstore, FileConfigstore} from './configstores'
import {DataStore, Upload, ERRORS} from '@tus/utils'

export * from './configstores'

type Options = {
  directory: string
  configstore?: Configstore
  expirationPeriodInMilliseconds?: number
}

const MASK = '0777'
const IGNORED_MKDIR_ERROR = 'EEXIST'
const FILE_DOESNT_EXIST = 'ENOENT'
const log = debug('tus-node-server:stores:filestore')

export class FileStore extends DataStore {
  directory: string
  configstore: Configstore
  expirationPeriodInMilliseconds: number

  constructor({directory, configstore, expirationPeriodInMilliseconds}: Options) {
    super()
    this.directory = directory
    this.configstore = configstore ?? new FileConfigstore(directory)
    this.expirationPeriodInMilliseconds = expirationPeriodInMilliseconds ?? 0
    this.extensions = [
      'creation',
      'creation-with-upload',
      'creation-defer-length',
      'termination',
      'expiration',
    ]
    // TODO: this async call can not happen in the constructor
    this.checkOrCreateDirectory()
  }

  /**
   *  Ensure the directory exists.
   */
  private checkOrCreateDirectory() {
    fs.mkdir(this.directory, {mode: MASK, recursive: true}, (error) => {
      if (error && error.code !== IGNORED_MKDIR_ERROR) {
        throw error
      }
    })
  }

  /**
   * Create an empty file.
   */
  async create(file: Upload): Promise<Upload> {
    const dirs = file.id.split('/').slice(0, -1)
    const filePath = path.join(this.directory, file.id)

    await fsProm.mkdir(path.join(this.directory, ...dirs), {recursive: true})
    await fsProm.writeFile(filePath, '')
    await this.configstore.set(file.id, file)

    file.storage = {type: 'file', path: filePath}

    return file
  }

  read(file_id: string) {
    return fs.createReadStream(path.join(this.directory, file_id))
  }

  remove(file_id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.unlink(`${this.directory}/${file_id}`, (err) => {
        if (err) {
          log('[FileStore] delete: Error', err)
          reject(ERRORS.FILE_NOT_FOUND)
          return
        }

        try {
          resolve(this.configstore.delete(file_id))
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  write(
    readable: http.IncomingMessage | stream.Readable,
    file_id: string,
    offset: number
  ): Promise<number> {
    const file_path = path.join(this.directory, file_id)
    const writeable = fs.createWriteStream(file_path, {
      flags: 'r+',
      start: offset,
    })

    let bytes_received = 0
    const transform = new stream.Transform({
      transform(chunk, _, callback) {
        bytes_received += chunk.length
        callback(null, chunk)
      },
    })

    return new Promise((resolve, reject) => {
      stream.pipeline(readable, transform, writeable, (err) => {
        if (err) {
          log('[FileStore] write: Error', err)
          return reject(ERRORS.FILE_WRITE_ERROR)
        }

        log(`[FileStore] write: ${bytes_received} bytes written to ${file_path}`)
        offset += bytes_received
        log(`[FileStore] write: File is now ${offset} bytes`)

        return resolve(offset)
      })
    })
  }

  async getUpload(id: string): Promise<Upload> {
    const file = await this.configstore.get(id)

    if (!file) {
      throw ERRORS.FILE_NOT_FOUND
    }

    return new Promise((resolve, reject) => {
      const file_path = `${this.directory}/${id}`
      fs.stat(file_path, (error, stats) => {
        if (error && error.code === FILE_DOESNT_EXIST && file) {
          log(
            `[FileStore] getUpload: No file found at ${file_path} but db record exists`,
            file
          )
          return reject(ERRORS.FILE_NO_LONGER_EXISTS)
        }

        if (error && error.code === FILE_DOESNT_EXIST) {
          log(`[FileStore] getUpload: No file found at ${file_path}`)
          return reject(ERRORS.FILE_NOT_FOUND)
        }

        if (error) {
          return reject(error)
        }

        if (stats.isDirectory()) {
          log(`[FileStore] getUpload: ${file_path} is a directory`)
          return reject(ERRORS.FILE_NOT_FOUND)
        }

        return resolve(
          new Upload({
            id,
            size: file.size,
            offset: stats.size,
            metadata: file.metadata,
            creation_date: file.creation_date,
            storage: {type: 'file', path: file_path},
          })
        )
      })
    })
  }

  async declareUploadLength(id: string, upload_length: number) {
    const file = await this.configstore.get(id)

    if (!file) {
      throw ERRORS.FILE_NOT_FOUND
    }

    file.size = upload_length

    await this.configstore.set(id, file)
  }

  async deleteExpired(): Promise<number> {
    const now = new Date()
    const toDelete: Promise<void>[] = []

    if (!this.configstore.list) {
      throw ERRORS.UNSUPPORTED_EXPIRATION_EXTENSION
    }

    const uploadKeys = await this.configstore.list()
    for (const file_id of uploadKeys) {
      try {
        const info = await this.configstore.get(file_id)
        if (
          info &&
          'creation_date' in info &&
          this.getExpiration() > 0 &&
          info.size !== info.offset &&
          info.creation_date
        ) {
          const creation = new Date(info.creation_date)
          const expires = new Date(creation.getTime() + this.getExpiration())
          if (now > expires) {
            toDelete.push(this.remove(file_id))
          }
        }
      } catch (error) {
        if (error !== ERRORS.FILE_NO_LONGER_EXISTS) {
          throw error
        }
      }
    }

    await Promise.all(toDelete)
    return toDelete.length
  }

  getExpiration(): number {
    return this.expirationPeriodInMilliseconds
  }
}
