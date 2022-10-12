import http from 'node:http'
import {EventEmitter} from 'node:events'

import debug from 'debug'

import GetHandler from './handlers/GetHandler'
import HeadHandler from './handlers/HeadHandler'
import OptionsHandler from './handlers/OptionsHandler'
import PatchHandler from './handlers/PatchHandler'
import PostHandler from './handlers/PostHandler'
import DeleteHandler from './handlers/DeleteHandler'
import RequestValidator from './validators/RequestValidator'

import {ERRORS, EXPOSED_HEADERS, REQUEST_METHODS, TUS_RESUMABLE} from './constants'

import type stream from 'node:stream'
import type {DataStore, ServerOptions, RouteHandler} from '../types'

export type Handlers = {
  GET: InstanceType<typeof GetHandler>
  HEAD: InstanceType<typeof HeadHandler>
  OPTIONS: InstanceType<typeof OptionsHandler>
  PATCH: InstanceType<typeof PatchHandler>
  POST: InstanceType<typeof PostHandler>
  DELETE: InstanceType<typeof DeleteHandler>
}

const log = debug('tus-node-server')

export default class Server extends EventEmitter {
  _datastore!: DataStore // Using ! to say this can never be undefined
  handlers: Handlers | Record<string, never> = {}
  options: ServerOptions

  constructor(options: ServerOptions) {
    super()

    if (!options) {
      throw new Error("'options' must be defined")
    }

    if (!options.path) {
      throw new Error("'path' is not defined; must have a path")
    }

    this.options = {...options}
    // Any handlers assigned to this object with the method as the key
    // will be used to repond to those requests. They get set/re-set
    // when a datastore is assigned to the server.
    // Remove any event listeners from each handler as they are removed
    // from the server. This must come before adding a 'newListener' listener,
    // to not add a 'removeListener' event listener to all request handlers.
    this.on('removeListener', (event, listener) => {
      this.datastore.removeListener(event, listener)
      for (const method of REQUEST_METHODS) {
        this.handlers[method].removeListener(event, listener)
      }
    })
    // As event listeners are added to the server, make sure they are
    // bubbled up from request handlers to fire on the server level.
    this.on('newListener', (event, listener) => {
      this.datastore.on(event, listener)
      for (const method of REQUEST_METHODS) {
        this.handlers[method].on(event, listener)
      }
    })
  }

  get datastore() {
    return this._datastore
  }

  set datastore(store) {
    this._datastore = store
    this.handlers = {
      // GET handlers should be written in the implementations
      GET: new GetHandler(store, this.options),
      // These methods are handled under the tus protocol
      HEAD: new HeadHandler(store, this.options),
      OPTIONS: new OptionsHandler(store, this.options),
      PATCH: new PatchHandler(store, this.options),
      POST: new PostHandler(store, this.options),
      DELETE: new DeleteHandler(store, this.options),
    }
  }

  get(path: string, handler: RouteHandler) {
    this.handlers.GET.registerPath(path, handler)
  }

  /**
   * Main server requestListener, invoked on every 'request' event.
   */
  async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse
    // TODO: this return type does not make sense
  ): Promise<http.ServerResponse | stream.Writable | void> {
    log(`[TusServer] handle: ${req.method} ${req.url}`)
    // Allow overriding the HTTP method. The reason for this is
    // that some libraries/environments to not support PATCH and
    // DELETE requests, e.g. Flash in a browser and parts of Java
    if (req.headers['x-http-method-override']) {
      req.method = (req.headers['x-http-method-override'] as string).toUpperCase()
    }

    if (req.method === 'GET') {
      const handler = this.handlers.GET
      return handler.send(req, res).catch((error) => {
        log(`[${handler.constructor.name}]`, error)
        const status_code = error.status_code || ERRORS.UNKNOWN_ERROR.status_code
        const body = error.body || `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`
        return handler.write(res, status_code, {}, body)
      })
    }

    // The Tus-Resumable header MUST be included in every request and
    // response except for OPTIONS requests. The value MUST be the version
    // of the protocol used by the Client or the Server.
    res.setHeader('Tus-Resumable', TUS_RESUMABLE)
    if (req.method !== 'OPTIONS' && req.headers['tus-resumable'] === undefined) {
      res.writeHead(412, 'Precondition Failed')
      return res.end('Tus-Resumable Required\n')
    }

    // Validate all required headers to adhere to the tus protocol
    const invalid_headers = []
    for (const header_name in req.headers) {
      if (req.method === 'OPTIONS') {
        continue
      }

      // Content type is only checked for PATCH requests. For all other
      // request methods it will be ignored and treated as no content type
      // was set because some HTTP clients may enforce a default value for
      // this header.
      // See https://github.com/tus/tus-node-server/pull/116
      if (header_name.toLowerCase() === 'content-type' && req.method !== 'PATCH') {
        continue
      }

      if (RequestValidator.isInvalidHeader(header_name, req.headers[header_name])) {
        log(`Invalid ${header_name} header: ${req.headers[header_name]}`)
        invalid_headers.push(header_name)
      }
    }

    if (invalid_headers.length > 0) {
      // The request was not configured to the tus protocol
      res.writeHead(400, 'Bad Request')
      return res.end(`Invalid ${invalid_headers.join(' ')}\n`)
    }

    // Enable CORS
    res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS)
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
    }

    // Invoke the handler for the method requested
    const handler = this.handlers[req.method as keyof Handlers]
    if (handler) {
      return handler.send(req, res).catch((error) => {
        log(`[${handler.constructor.name}]`, error)
        const status_code = error.status_code || ERRORS.UNKNOWN_ERROR.status_code
        const body = error.body || `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`
        return handler.write(res, status_code, {}, body)
      })
    }

    // 404 Anything else
    res.writeHead(404, {})
    res.write('Not found\n')
    return res.end()
  }

  listen() {
    const server = http.createServer(this.handle.bind(this))
    return server.listen.apply(server)
  }
}
