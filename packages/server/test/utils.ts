import {Readable} from 'node:stream'
import {ReadableOptions} from 'stream'

interface MockIncomingMessageOptions extends ReadableOptions {
  headers?: Record<string, string>
  httpVersion?: string
  method?: string
  url?: string
  chunks?: Buffer[] // Array of data chunks to emit
}

export class MockIncomingMessage extends Readable {
  public headers: Record<string, string>
  public httpVersion: string
  public method: string
  public url: string
  private chunks: Buffer[]
  private currentIndex: number

  constructor(options: MockIncomingMessageOptions = {}) {
    super(options)
    this.headers = options.headers || {}
    this.httpVersion = options.httpVersion || '1.1'
    this.method = options.method || 'GET'
    this.url = options.url || '/'
    this.chunks = options.chunks || []
    this.currentIndex = 0
  }

  addBodyChunk(buffer: Buffer) {
    this.chunks.push(buffer)
  }

  _read(): void {
    if (this.currentIndex < this.chunks.length) {
      const chunk = this.chunks[this.currentIndex]
      this.push(chunk)
      this.currentIndex++
    } else if (this.currentIndex === this.chunks.length) {
      // No more chunks, end the stream
      this.push(null)
      this.currentIndex++
    }
  }
}
