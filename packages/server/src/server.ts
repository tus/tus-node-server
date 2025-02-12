import http from 'node:http'
import {EventEmitter} from 'node:events'

import debug from 'debug'
import {EVENTS, ERRORS, EXPOSED_HEADERS, REQUEST_METHODS, TUS_RESUMABLE} from '@tus/utils'
import type {DataStore, Upload, CancellationContext} from '@tus/utils'

import {BaseHandler} from './handlers/BaseHandler'
import {GetHandler} from './handlers/GetHandler'
import {HeadHandler} from './handlers/HeadHandler'
import {OptionsHandler} from './handlers/OptionsHandler'
import {PatchHandler} from './handlers/PatchHandler'
import {PostHandler} from './handlers/PostHandler'
import {DeleteHandler} from './handlers/DeleteHandler'
import {validateHeader} from './validators/HeaderValidator'
import type {ServerOptions, RouteHandler, WithOptional} from './types'
import {MemoryLocker} from './lockers'
import {getRequest, setResponse} from './web'

type Handlers = {
  GET: InstanceType<typeof GetHandler>
  HEAD: InstanceType<typeof HeadHandler>
  OPTIONS: InstanceType<typeof OptionsHandler>
  PATCH: InstanceType<typeof PatchHandler>
  POST: InstanceType<typeof PostHandler>
  DELETE: InstanceType<typeof DeleteHandler>
}

interface TusEvents {
  [EVENTS.POST_CREATE]: (req: Request, upload: Upload, url: string) => void
  /** @deprecated this is almost the same as POST_FINISH, use POST_RECEIVE_V2 instead */
  [EVENTS.POST_RECEIVE]: (req: Request, upload: Upload) => void
  [EVENTS.POST_RECEIVE_V2]: (req: Request, upload: Upload) => void
  [EVENTS.POST_FINISH]: (req: Request, res: Response, upload: Upload) => void
  [EVENTS.POST_TERMINATE]: (req: Request, res: Response, id: string) => void
}

type on = EventEmitter['on']
type emit = EventEmitter['emit']

export declare interface Server {
  on<Event extends keyof TusEvents>(event: Event, listener: TusEvents[Event]): this
  on(eventName: Parameters<on>[0], listener: Parameters<on>[1]): this

  emit<Event extends keyof TusEvents>(
    event: Event,
    listener: TusEvents[Event]
  ): ReturnType<emit>
  emit(eventName: Parameters<emit>[0], listener: Parameters<emit>[1]): ReturnType<emit>
}

const log = debug('tus-node-server')

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: it's fine
export class Server extends EventEmitter {
  datastore: DataStore
  handlers: Handlers
  options: ServerOptions

  constructor(options: WithOptional<ServerOptions, 'locker'> & {datastore: DataStore}) {
    super()

    if (!options) {
      throw new Error("'options' must be defined")
    }

    if (!options.path) {
      throw new Error("'path' is not defined; must have a path")
    }

    if (!options.datastore) {
      throw new Error("'datastore' is not defined; must have a datastore")
    }

    if (!options.locker) {
      options.locker = new MemoryLocker()
    }

    if (!options.lockDrainTimeout) {
      options.lockDrainTimeout = 3000
    }

    if (!options.postReceiveInterval) {
      options.postReceiveInterval = 1000
    }

    const {datastore, ...rest} = options
    this.options = rest as ServerOptions
    this.datastore = datastore
    this.handlers = {
      // GET handlers should be written in the implementations
      GET: new GetHandler(this.datastore, this.options),
      // These methods are handled under the tus protocol
      HEAD: new HeadHandler(this.datastore, this.options),
      OPTIONS: new OptionsHandler(this.datastore, this.options),
      PATCH: new PatchHandler(this.datastore, this.options),
      POST: new PostHandler(this.datastore, this.options),
      DELETE: new DeleteHandler(this.datastore, this.options),
    }

    // Any handlers assigned to this object with the method as the key
    // will be used to respond to those requests. They get set/re-set
    // when a datastore is assigned to the server.
    // Remove any event listeners from each handler as they are removed
    // from the server. This must come before adding a 'newListener' listener,
    // to not add a 'removeListener' event listener to all request handlers.
    this.on('removeListener', (event: string, listener) => {
      this.datastore.removeListener(event, listener)
      for (const method of REQUEST_METHODS) {
        this.handlers[method].removeListener(event, listener)
      }
    })
    // As event listeners are added to the server, make sure they are
    // bubbled up from request handlers to fire on the server level.
    this.on('newListener', (event: string, listener) => {
      this.datastore.on(event, listener)
      for (const method of REQUEST_METHODS) {
        this.handlers[method].on(event, listener)
      }
    })
  }

  get(path: string, handler: RouteHandler) {
    this.handlers.GET.registerPath(this.options.path + path, handler)
  }

  async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const {proto, host} = BaseHandler.extractHostAndProto(
      // @ts-expect-error it's fine
      new Headers(req.headers),
      this.options.respectForwardedHeaders
    )
    const base = `${proto}://${host}${this.options.path}`
    const webReq = await getRequest({request: req, base})
    const webRes = await this.handler(webReq)
    return setResponse(res, webRes)
  }

  async handleWeb(req: Request) {
    return this.handler(req)
  }

  private async handler(req: Request) {
    const context = this.createContext()
    const headers = new Headers()

    const onError = async (error: {
      status_code?: number
      body?: string
      message: string
    }) => {
      let status_code = error.status_code || ERRORS.UNKNOWN_ERROR.status_code
      let body = error.body || `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`

      if (this.options.onResponseError) {
        const errorMapping = await this.options.onResponseError(req, error as Error)
        if (errorMapping) {
          status_code = errorMapping.status_code
          body = errorMapping.body
        }
      }

      return this.write(context, headers, status_code, body)
    }

    if (req.method === 'GET') {
      const handler = this.handlers.GET
      const res = await handler.send(req, context, headers).catch(onError)
      context.abort
      return res
    }

    // The Tus-Resumable header MUST be included in every request and
    // response except for OPTIONS requests. The value MUST be the version
    // of the protocol used by the Client or the Server.
    headers.set('Tus-Resumable', TUS_RESUMABLE)

    if (req.method !== 'OPTIONS' && !req.headers.get('tus-resumable')) {
      return this.write(context, headers, 412, 'Tus-Resumable Required\n')
    }

    // Validate all required headers to adhere to the tus protocol
    const invalid_headers = []
    for (const [name, value] of req.headers.entries()) {
      if (req.method === 'OPTIONS') {
        continue
      }

      // Content type is only checked for PATCH requests. For all other
      // request methods it will be ignored and treated as no content type
      // was set because some HTTP clients may enforce a default value for
      // this header.
      // See https://github.com/tus/tus-node-server/pull/116
      if (name.toLowerCase() === 'content-type' && req.method !== 'PATCH') {
        continue
      }

      if (!validateHeader(name, value)) {
        log(`Invalid ${name} header: ${value}`)
        invalid_headers.push(name)
      }
    }

    if (invalid_headers.length > 0) {
      return this.write(context, headers, 400, `Invalid ${invalid_headers.join(' ')}\n`)
    }

    // Enable CORS
    headers.set(
      'Access-Control-Allow-Origin',
      this.getCorsOrigin(req.headers.get('origin'))
    )
    headers.set('Access-Control-Expose-Headers', EXPOSED_HEADERS)

    if (this.options.allowedCredentials === true) {
      headers.set('Access-Control-Allow-Credentials', 'true')
    }

    // Invoke the handler for the method requested
    const handler = this.handlers[req.method as keyof Handlers]
    if (handler) {
      return handler.send(req, context, headers).catch(onError)
    }

    return this.write(context, headers, 404, 'Not found\n')
  }

  private getCorsOrigin(origin?: string | null): string {
    const isOriginAllowed =
      this.options.allowedOrigins?.some((allowedOrigin) => allowedOrigin === origin) ??
      true

    if (origin && isOriginAllowed) {
      return origin
    }

    if (this.options.allowedOrigins && this.options.allowedOrigins.length > 0) {
      return this.options.allowedOrigins[0]
    }

    return '*'
  }

  async write(context: CancellationContext, headers: Headers, status: number, body = '') {
    const isAborted = context.signal.aborted

    if (status !== 204) {
      headers.set('Content-Length', String(Buffer.byteLength(body, 'utf8')))
    }

    if (isAborted) {
      // This condition handles situations where the request has been flagged as aborted.
      // In such cases, the server informs the client that the connection will be closed.
      // This is communicated by setting the 'Connection' header to 'close' in the response.
      // This step is essential to prevent the server from continuing to process a request
      // that is no longer needed, thereby saving resources.
      headers.set('Connection', 'close')
    }

    return new Response(body, {status, headers})
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  listen(...args: any[]): http.Server {
    return http.createServer(this.handle.bind(this)).listen(...args)
  }

  cleanUpExpiredUploads(): Promise<number> {
    if (!this.datastore.hasExtension('expiration')) {
      throw ERRORS.UNSUPPORTED_EXPIRATION_EXTENSION
    }

    return this.datastore.deleteExpired()
  }

  protected createContext() {
    // Initialize two AbortControllers:
    // 1. `requestAbortController` for instant request termination, particularly useful for stopping clients to upload when errors occur.
    // 2. `abortWithDelayController` to introduce a delay before aborting, allowing the server time to complete ongoing operations.
    // This is particularly useful when a future request may need to acquire a lock currently held by this request.
    const requestAbortController = new AbortController()
    const abortWithDelayController = new AbortController()

    const onDelayedAbort = (err: unknown) => {
      setTimeout(() => {
        requestAbortController.abort(err)
      }, this.options.lockDrainTimeout)
    }
    abortWithDelayController.signal.addEventListener('abort', onDelayedAbort, {
      once: true,
    })

    return {
      signal: requestAbortController.signal,
      abort: () => {
        // abort the request immediately
        if (!requestAbortController.signal.aborted) {
          requestAbortController.abort(ERRORS.ABORTED)
        }
      },
      cancel: () => {
        // Initiates the delayed abort sequence unless it's already in progress.
        if (!abortWithDelayController.signal.aborted) {
          abortWithDelayController.abort(ERRORS.ABORTED)
        }
      },
    }
  }
}
