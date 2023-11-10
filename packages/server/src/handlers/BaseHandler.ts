import EventEmitter from 'node:events'

import type {ServerOptions} from '../types'
import type {DataStore, UploadIdGenerator} from '../models'
import type http from 'node:http'
import {DefaultUploadIdGenerator} from '../models'

export class BaseHandler extends EventEmitter {
  options: ServerOptions
  store: DataStore
  uploadIdGenerator: UploadIdGenerator

  constructor(store: DataStore, options: ServerOptions) {
    super()
    if (!store) {
      throw new Error('Store must be defined')
    }

    this.store = store
    this.options = options
    this.uploadIdGenerator =
      options.uploadIdGenerator ??
      new DefaultUploadIdGenerator({
        path: options.path,
        relativeLocation: options.relativeLocation,
        respectForwardedHeaders: options.respectForwardedHeaders,
      })
  }

  write(res: http.ServerResponse, status: number, headers = {}, body = '') {
    if (status !== 204) {
      // @ts-expect-error not explicitly typed but possible
      headers['Content-Length'] = Buffer.byteLength(body, 'utf8')
    }
    res.writeHead(status, headers)
    res.write(body)
    return res.end()
  }

  generateUrl(req: http.IncomingMessage, id: string) {
    return this.uploadIdGenerator.generateUrl(req, id)
  }

  getFileIdFromRequest(req: http.IncomingMessage) {
    return this.uploadIdGenerator.getFileIdFromRequest(req)
  }
}
