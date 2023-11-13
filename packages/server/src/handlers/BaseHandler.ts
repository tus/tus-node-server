import EventEmitter from 'node:events'

import type {ServerOptions} from '../types'
import type {DataStore} from '../models'
import type http from 'node:http'
import {Upload} from '../models'
import {ERRORS} from '../constants'

const reExtractFileID = /([^/]+)\/?$/
const reForwardedHost = /host="?([^";]+)/
const reForwardedProto = /proto=(https?)/

export class BaseHandler extends EventEmitter {
  options: ServerOptions
  store: DataStore

  constructor(store: DataStore, options: ServerOptions) {
    super()
    if (!store) {
      throw new Error('Store must be defined')
    }

    this.store = store
    this.options = options
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
    id = encodeURIComponent(id)

    const forwarded = req.headers.forwarded as string | undefined
    const path = this.options.path === '/' ? '' : this.options.path
    // @ts-expect-error baseUrl type doesn't exist?
    const baseUrl = req.baseUrl ?? ''
    let proto
    let host

    if (this.options.relativeLocation) {
      return `${baseUrl}${path}/${id}`
    }

    if (this.options.respectForwardedHeaders) {
      if (forwarded) {
        host ??= reForwardedHost.exec(forwarded)?.[1]
        proto ??= reForwardedProto.exec(forwarded)?.[1]
      }

      const forwardHost = req.headers['x-forwarded-host']
      const forwardProto = req.headers['x-forwarded-proto']

      // @ts-expect-error we can pass undefined
      if (['http', 'https'].includes(forwardProto)) {
        proto ??= forwardProto as string
      }

      host ??= forwardHost
    }

    host ??= req.headers.host
    proto ??= 'http'

    return `${proto}://${host}${baseUrl}${path}/${id}`
  }

  getFileIdFromRequest(req: http.IncomingMessage) {
    const match = reExtractFileID.exec(req.url as string)

    if (!match || this.options.path.includes(match[1])) {
      return false
    }

    return decodeURIComponent(match[1])
  }

  getConfiguredMaxSize(req: http.IncomingMessage, id: string) {
    if (typeof this.options.maxSize === 'function') {
      return this.options.maxSize(req, id)
    }
    return this.options.maxSize ?? 0
  }

  async getBodyMaxSize(
    req: http.IncomingMessage,
    info: Upload,
    configuredMaxSize?: number
  ) {
    configuredMaxSize =
      configuredMaxSize ?? (await this.getConfiguredMaxSize(req, info.id))

    const length = parseInt(req.headers['content-length'] || '0', 10)
    const offset = info.offset

    // Test if this upload fits into the file's size
    if (!info.sizeIsDeferred && offset + length > (info.size || 0)) {
      throw ERRORS.ERR_SIZE_EXCEEDED
    }

    let maxSize = (info.size || 0) - offset
    // If the upload's length is deferred and the PATCH request does not contain the Content-Length
    // header (which is allowed if 'Transfer-Encoding: chunked' is used), we still need to set limits for
    // the body size.
    if (info.sizeIsDeferred) {
      if (configuredMaxSize > 0) {
        // Ensure that the upload does not exceed the maximum upload size
        maxSize = configuredMaxSize - offset
      } else {
        // If no upload limit is given, we allow arbitrary sizes
        maxSize = Number.MAX_SAFE_INTEGER
      }
    }

    if (length > 0) {
      maxSize = length
    }

    // limit the request body to the maxSize if provided
    if (configuredMaxSize > 0 && maxSize > configuredMaxSize) {
      maxSize = configuredMaxSize
    }

    return maxSize
  }
}
