import EventEmitter from 'node:events'

import type {DataStore, ServerOptions} from '../../types'
import type http from 'node:http'

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

  generateUrl(req: http.IncomingMessage, file_id: string) {
    if (this.options.relativeLocation) {
      // TODO
      // @ts-expect-error baseUrl doesn't exist? Should this be `.url`?
      return `${req.baseUrl || ''}${this.options.path}/${file_id}`
    }

    // @ts-expect-error baseUrl doesn't exist? Should this be `.url`?
    return `//${req.headers.host}${req.baseUrl || ''}${this.options.path}/${file_id}`
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
