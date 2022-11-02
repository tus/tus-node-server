// TODO: use /promises versions
import fs from 'node:fs'
import path from 'node:path'
import stream from 'node:stream'
import http from 'node:http'

import debug from 'debug'
import Configstore from 'configstore'

import DataStore from './DataStore'
import pkg from '../../package.json'
import {ERRORS} from '../constants'

import File from '../models/File'

type Store = {
  get(key: string): File | undefined
  set(key: string, value: File): void
  delete(key: string): void
}

type Options = {
  directory: string
  configstore?: Store
}

const MASK = '0777'
const IGNORED_MKDIR_ERROR = 'EEXIST'
const FILE_DOESNT_EXIST = 'ENOENT'
const log = debug('tus-node-server:stores:filestore')

export default class FileStore extends DataStore {
  directory: string
  configstore: Store

  constructor({directory, configstore}: Options) {
    super()
    this.directory = directory
    this.configstore = configstore ?? new Configstore(`${pkg.name}-${pkg.version}`)
    this.extensions = [
      'creation',
      'creation-with-upload',
      'creation-defer-length',
      'termination',
    ]
    // TODO: this async call can not happen in the constructor
    this.checkOrCreateDirectory()
  }

  /**
   *  Ensure the directory exists.
   */
  private checkOrCreateDirectory() {
    fs.mkdir(this.directory, MASK, (error) => {
      if (error && error.code !== IGNORED_MKDIR_ERROR) {
        throw error
      }
    })
  }

  /**
   * Create an empty file.
   */
  create(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      fs.open(path.join(this.directory, file.id), 'w', (err, fd) => {
        if (err) {
          log('[FileStore] create: Error', err)
          return reject(err)
        }

        this.configstore.set(file.id, file)

        return fs.close(fd, (exception) => {
          if (exception) {
            log('[FileStore] create: Error', exception)
            return reject(exception)
          }

          return resolve(file)
        })
      })
    })
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
    const writeable = fs.createWriteStream(path.join(this.directory, file_id), {
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

        log(`[FileStore] write: ${bytes_received} bytes written to ${path}`)
        offset += bytes_received
        log(`[FileStore] write: File is now ${offset} bytes`)

        return resolve(offset)
      })
    })
  }

  async getUpload(id: string): Promise<File> {
    const file = this.configstore.get(id)

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
          new File({id, size: file.size, offset: stats.size, metadata: file.metadata})
        )
      })
    })
  }

  async declareUploadLength(id: string, upload_length: number) {
    const file = this.configstore.get(id)

    if (!file) {
      throw ERRORS.FILE_NOT_FOUND
    }

    file.size = upload_length

    this.configstore.set(id, file)
  }
}
