import EventEmitter from 'node:events'

import type {ServerOptions} from '../types'
import type {DataStore} from '../models'
import type http from 'node:http'

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
    // @ts-expect-error
    const baseUrl = req.baseUrl ?? ''
    const path = this.options.path === '/' ? '' : this.options.path

    if (this.options.generateUrl) {
      // user-defined generateUrl function
      const {proto, host} = this.extractHostAndProto(req)

      return this.options.generateUrl(req, {
        proto,
        host,
        // @ts-expect-error we can pass undefined
        baseUrl: req.baseUrl,
        path: path,
        id,
      })
    }

    // Default implementation
    if (this.options.relativeLocation) {
      return `${baseUrl}${path}/${id}`
    }

    const {proto, host} = this.extractHostAndProto(req)

    return `${proto}://${host}${baseUrl}${path}/${id}`
  }

  getFileIdFromRequest(req: http.IncomingMessage) {
    if (this.options.getFileIdFromRequest) {
      return this.options.getFileIdFromRequest(req)
    }
    const match = reExtractFileID.exec(req.url as string)

    if (!match || this.options.path.includes(match[1])) {
      return
    }

    return decodeURIComponent(match[1])
  }

  protected extractHostAndProto(req: http.IncomingMessage) {
    let proto
    let host

    if (this.options.respectForwardedHeaders) {
      const forwarded = req.headers.forwarded as string | undefined
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

    return {host: host as string, proto}
  }
}
