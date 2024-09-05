import {Transform, type TransformCallback} from 'node:stream'
import {ERRORS} from '../constants'

// TODO: create HttpError and use it everywhere instead of throwing objects
export class MaxFileExceededError extends Error {
  status_code: number
  body: string

  constructor() {
    super(ERRORS.ERR_MAX_SIZE_EXCEEDED.body)
    this.status_code = ERRORS.ERR_MAX_SIZE_EXCEEDED.status_code
    this.body = ERRORS.ERR_MAX_SIZE_EXCEEDED.body
    Object.setPrototypeOf(this, MaxFileExceededError.prototype)
  }
}

export class StreamLimiter extends Transform {
  private maxSize: number
  private currentSize = 0

  constructor(maxSize: number) {
    super()
    this.maxSize = maxSize
  }

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
    this.currentSize += chunk.length
    if (this.currentSize > this.maxSize) {
      callback(new MaxFileExceededError())
    } else {
      callback(null, chunk)
    }
  }
}
