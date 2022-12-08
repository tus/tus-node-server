/* global BufferEncoding */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import stream from 'node:stream'

function randomString(size: number) {
  return crypto.randomBytes(size).toString('base64url').slice(0, size)
}

type Options = {
  chunkSize: number
  directory: string
}

type Callback = (error: Error | null) => void

export class StreamSplitter extends stream.Writable {
  directory: Options['directory']
  currentChunkPath: string | null
  currentChunkSize: number
  fileHandle: fs.FileHandle | null
  filenameTemplate: string
  chunkSize: Options['chunkSize']
  part: number

  constructor({chunkSize, directory}: Options, options?: stream.WritableOptions) {
    super(options)
    this.chunkSize = chunkSize
    this.currentChunkPath = null
    this.currentChunkSize = 0
    this.fileHandle = null
    this.directory = directory
    this.filenameTemplate = randomString(10)
    this.part = 0
    this.on('error', this._finishChunk.bind(this))
  }

  async _write(chunk: Buffer, _: BufferEncoding, callback: Callback) {
    try {
      // In order to start writing a chunk, we must first create
      // a file system reference for it
      if (this.fileHandle === null) {
        await this._newChunk()
      }

      const overflow = this.currentChunkSize + chunk.length - this.chunkSize
      // The current chunk will be more than our defined part size if we would
      // write all of it to disk.
      if (overflow > 0) {
        // Only write to disk the up to our defined part size.
        await this._writeChunk(chunk.slice(0, chunk.length - overflow))
        await this._finishChunk()
        // We still have some overflow left, so we write it to a new chunk.
        await this._newChunk()
        await this._writeChunk(chunk.slice(chunk.length - overflow, chunk.length))
        callback(null)
        return
      }

      // The chunk is smaller than our defined part size so we can just write it to disk.
      await this._writeChunk(chunk)
      callback(null)
    } catch (error) {
      callback(error)
    }
  }

  async _final(callback: Callback) {
    if (this.fileHandle === null) {
      callback(null)
      return
    }

    try {
      await this._finishChunk()
      callback(null)
    } catch (error) {
      callback(error)
    }
  }

  async _writeChunk(chunk: Buffer): Promise<void> {
    await fs.appendFile(this.fileHandle as fs.FileHandle, chunk)
    this.currentChunkSize += chunk.length
  }

  async _finishChunk(): Promise<void> {
    if (this.fileHandle === null) {
      return
    }

    await this.fileHandle.close()

    this.emit('chunkFinished', {
      path: this.currentChunkPath,
      size: this.currentChunkSize,
    })
    this.currentChunkPath = null
    this.fileHandle = null
    this.currentChunkSize = 0
    this.part += 1
  }

  async _newChunk(): Promise<void> {
    this.currentChunkPath = path.join(
      this.directory,
      `${this.filenameTemplate}-${this.part}`
    )
    const fileHandle = await fs.open(this.currentChunkPath, 'w')
    this.emit('chunkStarted', this.currentChunkPath)
    this.currentChunkSize = 0
    this.fileHandle = fileHandle
  }
}
