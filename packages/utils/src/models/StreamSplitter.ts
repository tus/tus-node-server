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

    this.on('error', this._handleError.bind(this))
  }

  async _write(chunk: Buffer, _: BufferEncoding, callback: Callback) {
    try {
      // In order to start writing a chunk, we must first create
      // a file system reference for it
      if (this.fileHandle === null) {
        await this._newChunk()
      }

      let overflow = this.currentChunkSize + chunk.length - this.chunkSize

      // The current chunk will be more than our defined part size if we would
      // write all of it to disk.
      while (overflow > 0) {
        // Only write to disk the up to our defined part size.
        await this._writeChunk(chunk.subarray(0, chunk.length - overflow))
        await this._finishChunk()

        // We still have some overflow left, so we write it to a new chunk.
        await this._newChunk()
        chunk = chunk.subarray(chunk.length - overflow, chunk.length)
        overflow = this.currentChunkSize + chunk.length - this.chunkSize
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

  async _handleError() {
    await this.emitEvent('chunkError', this.currentChunkPath)
    // If there was an error, we want to stop allowing to write on disk as we cannot advance further.
    // At this point the chunk might be incomplete advancing further might cause data loss.
    // some scenarios where this might happen is if the disk is full or if we abort the stream midway.
    if (this.fileHandle === null) {
      return
    }

    await this.fileHandle.close()
    this.currentChunkPath = null
    this.fileHandle = null
  }

  async _finishChunk(): Promise<void> {
    if (this.fileHandle === null) {
      return
    }

    await this.fileHandle.close()

    await this.emitEvent('chunkFinished', {
      path: this.currentChunkPath,
      size: this.currentChunkSize,
    })

    this.currentChunkPath = null
    this.fileHandle = null
    this.currentChunkSize = 0
    this.part += 1
  }

  async emitEvent<T>(name: string, payload: T) {
    const listeners = this.listeners(name)
    for (const listener of listeners) {
      await listener(payload)
    }
  }

  async _newChunk(): Promise<void> {
    const currentChunkPath = path.join(
      this.directory,
      `${this.filenameTemplate}-${this.part}`
    )
    await this.emitEvent('beforeChunkStarted', currentChunkPath)
    this.currentChunkPath = currentChunkPath

    const fileHandle = await fs.open(this.currentChunkPath, 'w')
    await this.emitEvent('chunkStarted', this.currentChunkPath)
    this.currentChunkSize = 0
    this.fileHandle = fileHandle
  }
}
