import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import stream from 'node:stream'

function randomString(size: number) {
  return crypto.randomBytes(size).toString('base64url').slice(0, size)
}

type Options = {
  maxChunkSize: number
  directory: string
}

export default class FileStreamSplitter extends stream.Writable {
  directory: Options['directory']
  currentChunkPath: string | null
  currentChunkSize: number | null
  fileDescriptor: number | null
  filenameTemplate: string
  maxChunkSize: Options['maxChunkSize']
  part: number

  constructor({maxChunkSize, directory}: Options, options: stream.WritableOptions) {
    super(options)
    this.maxChunkSize = maxChunkSize
    this.currentChunkPath = null
    this.currentChunkSize = null
    this.fileDescriptor = null
    this.directory = directory
    this.filenameTemplate = randomString(10)
    this.part = 0
    this.on('error', this._finishChunk.bind(this))
  }

  _write(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chunk: any,
    _: globalThis.BufferEncoding,
    callback: (error: Error | null) => void
  ) {
    Promise.resolve()
      .then(() => {
        // In order to start writing a chunk, we must first create
        // a file system reference for it
        if (this.fileDescriptor === null) {
          return this._newChunk()
        }
      })
      .then(() => {
        const overflow = this.currentChunkSize + chunk.length - this.maxChunkSize
        // If the chunk is bigger than the defined max chunk size,
        // we need two passes to process the chunk
        if (overflow > 0) {
          return this._writeChunk(chunk.slice(0, chunk.length - overflow))
            .then(this._finishChunk.bind(this))
            .then(this._newChunk.bind(this))
            .then(() => {
              return this._writeChunk(chunk.slice(chunk.length - overflow, chunk.length))
            })
            .then(() => callback(null))
            .catch(callback)
        }

        // The chunk fits in the max chunk size
        return this._writeChunk(chunk)
          .then(() => callback(null))
          .catch(callback)
      })
      .catch(callback)
  }

  _final(callback: () => void) {
    if (this.fileDescriptor === null) {
      callback()
    } else {
      this._finishChunk()
        .then(() => callback())
        .catch(callback)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _writeChunk(chunk: any): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.write(this.fileDescriptor as number, chunk, (err) => {
        if (err) {
          return reject(err)
        }

        this.currentChunkSize += chunk.length
        return resolve()
      })
    })
  }

  _finishChunk(): Promise<void> {
    if (this.fileDescriptor === null) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      fs.close(this.fileDescriptor as number, (err) => {
        if (err) {
          return reject(err)
        }

        this.emit('chunkFinished', {
          path: this.currentChunkPath,
          size: this.currentChunkSize,
        })
        this.currentChunkPath = null
        this.fileDescriptor = null
        this.currentChunkSize = null
        this.part += 1
        return resolve()
      })
    })
  }

  _newChunk(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.currentChunkPath = path.join(
        this.directory,
        `${this.filenameTemplate}-${this.part}`
      )
      fs.open(this.currentChunkPath, 'w', (err, fd) => {
        if (err) {
          return reject(err)
        }

        this.emit('chunkStarted', this.currentChunkPath)
        this.currentChunkSize = 0
        this.fileDescriptor = fd
        return resolve()
      })
    })
  }
}
