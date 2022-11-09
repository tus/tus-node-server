import EventEmitter from 'node:events'

import type {DataStore, ServerOptions} from '../../types'
import type http from 'node:http'

const reForwardedHost = /host="?([^";]+)/
const reForwardedProto = /proto=(https?)/

export default class BaseHandler extends EventEmitter {
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
    headers = status === 204 ? headers : {...headers, 'Content-Length': body.length}
    res.writeHead(status, headers)
    res.write(body)
    return res.end()
  }

  generateUrl(req: http.IncomingMessage, id: string) {
    const forwarded = req.headers.Forwarded as string | undefined
    const path = this.options.path === '/' ? '' : this.options.path
    let proto
    let host

    if (this.options.relativeLocation) {
      // @ts-expect-error baseUrl type doesn't exist?
      return `${req.baseUrl || ''}${path}/${id}`
    }

    if (this.options.respectForwardedHeaders) {
      if (forwarded) {
        host ??= reForwardedHost.exec(forwarded)?.[1]
        proto ??= reForwardedProto.exec(forwarded)?.[1]
      }

      const forwardHost = req.headers['X-Forwarded-Host']
      const forwardProto = req.headers['X-Forwarded-Proto']

      // @ts-expect-error we can pass undefined
      if (['http', 'https'].includes(forwardProto)) {
        proto ??= forwardProto as string
      }

      host ??= forwardHost
    }

    host ??= req.headers.host
    proto ??= 'http'

    // @ts-expect-error baseUrl type doesn't exist?
    return `${proto}://${host}${req.baseUrl ?? ''}${path}/${id}`
  }

  getFileIdFromRequest(req: http.IncomingMessage) {
    // @ts-expect-error baseUrl doesn't exist? Should this be `.url`?
    const re = new RegExp(`${req.baseUrl || ''}${this.options.path}\\/(\\S+)\\/?`)
    // @ts-expect-error originalUrl doesn't exist?
    const match = (req.originalUrl || req.url).match(re)
    if (!match) {
      return false
    }

    const file_id = match[1]
    return file_id
  }
}
