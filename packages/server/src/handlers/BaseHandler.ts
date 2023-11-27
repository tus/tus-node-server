import EventEmitter from 'node:events'

import type {ServerOptions} from '../types'
import type {DataStore} from '../models'
import type http from 'node:http'
import stream from 'node:stream'
import {ERRORS} from '../constants'

const reExtractFileID = /([^/]+)\/?$/
const reForwardedHost = /host="?([^";]+)/
const reForwardedProto = /proto=(https?)/

export interface CancellationContext {
  signal: AbortSignal
  abort: () => void
  cancel: () => void
}

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

  protected getLocker(req: http.IncomingMessage) {
    if (typeof this.options.locker === 'function') {
      return this.options.locker(req)
    }
    return this.options.locker
  }

  protected async acquireLock(
    req: http.IncomingMessage,
    id: string,
    context: CancellationContext
  ) {
    const locker = this.getLocker(req)
    await locker?.lock(id, () => {
      context.cancel()
    })

    return () => locker?.unlock(id)
  }

  protected writeToStore(
    req: http.IncomingMessage,
    id: string,
    offset: number,
    context: CancellationContext
  ) {
    return new Promise<number>(async (resolve, reject) => {
      if (context.signal.aborted) {
        reject(ERRORS.ABORTED)
        return
      }

      const proxy = new stream.PassThrough()
      stream.addAbortSignal(context.signal, proxy)

      proxy.on('error', (err) => {
        if (err.name === 'AbortError') {
          reject(ERRORS.ABORTED)
        } else {
          reject(err)
        }
      })

      req.on('error', (err) => {
        if (!proxy.closed) {
          proxy.destroy(err)
        }
      })

      this.store.write(req.pipe(proxy), id, offset).then(resolve).catch(reject)
    })
  }
}
