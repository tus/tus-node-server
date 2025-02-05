import http from 'node:http'
import {EventEmitter} from 'node:events'

import debug from 'debug'

import {GetHandler} from './handlers/GetHandler'
import {HeadHandler} from './handlers/HeadHandler'
import {OptionsHandler} from './handlers/OptionsHandler'
import {PatchHandler} from './handlers/PatchHandler'
import {PostHandler} from './handlers/PostHandler'
import {DeleteHandler} from './handlers/DeleteHandler'
import {validateHeader} from './validators/HeaderValidator'

import {EVENTS, ERRORS, EXPOSED_HEADERS, REQUEST_METHODS, TUS_RESUMABLE} from '@tus/utils'

import type {ServerOptions, RouteHandler, WithOptional} from './types'
import type {DataStore, Upload, CancellationContext} from '@tus/utils'
import {MemoryLocker} from './lockers'
import {
  createApp,
  createRouter,
  defineEventHandler,
  type Router,
  type App as H3,
  type H3Event,
  toNodeListener,
  toWebRequest,
  getResponseHeaders,
  setHeader,
  getHeaders,
  getHeader,
  toWebHandler,
} from 'h3'

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
  app: H3
  router: Router
  handle: (req: http.IncomingMessage, res: http.ServerResponse) => void
  handleWeb: (req: Request) => Promise<Response>

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

    this.app = createApp()
    this.router = createRouter()
    this.app.use(this.router)
    this.router.use('/**', this.handler())
    this.handle = toNodeListener(this.app)
    this.handleWeb = toWebHandler(this.app)

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
    this.handlers.GET.registerPath(path, handler)
  }

  handler() {
    return defineEventHandler(async (event) => {
      log(event.toString())
      const context = this.createContext()

      // Once the request is closed we abort the context to clean up underline resources
      // req.on('close', () => {
      //   context.abort()
      // })

      const onError = async (error: {
        status_code?: number
        body?: string
        message: string
      }) => {
        let status_code = error.status_code || ERRORS.UNKNOWN_ERROR.status_code
        let body = error.body || `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`

        if (this.options.onResponseError) {
          const errorMapping = await this.options.onResponseError(
            toWebRequest(event),
            error as Error
          )
          if (errorMapping) {
            status_code = errorMapping.status_code
            body = errorMapping.body
          }
        }

        return this.write(context, event, status_code, body)
      }

      if (event.method === 'GET') {
        const handler = this.handlers.GET
        return handler.send(toWebRequest(event), context).catch(onError)
      }

      // The Tus-Resumable header MUST be included in every request and
      // response except for OPTIONS requests. The value MUST be the version
      // of the protocol used by the Client or the Server.
      setHeader(event, 'Tus-Resumable', TUS_RESUMABLE)

      if (event.method !== 'OPTIONS' && !getHeader(event, 'tus-resumable')) {
        return this.write(context, event, 412, 'Tus-Resumable Required\n')
      }

      // Validate all required headers to adhere to the tus protocol
      const invalid_headers = []
      for (const header_name in getHeaders(event)) {
        if (event.method === 'OPTIONS') {
          continue
        }

        // Content type is only checked for PATCH requests. For all other
        // request methods it will be ignored and treated as no content type
        // was set because some HTTP clients may enforce a default value for
        // this header.
        // See https://github.com/tus/tus-node-server/pull/116
        if (header_name.toLowerCase() === 'content-type' && event.method !== 'PATCH') {
          continue
        }

        if (!validateHeader(header_name, getHeader(event, header_name))) {
          log(`Invalid ${header_name} header: ${getHeader(event, header_name)}`)
          invalid_headers.push(header_name)
        }
      }

      if (invalid_headers.length > 0) {
        return this.write(context, event, 400, `Invalid ${invalid_headers.join(' ')}\n`)
      }

      // Enable CORS
      setHeader(
        event,
        'Access-Control-Allow-Origin',
        this.getCorsOrigin(getHeader(event, 'origin'))
      )
      setHeader(event, 'Access-Control-Expose-Headers', EXPOSED_HEADERS)

      if (this.options.allowedCredentials === true) {
        setHeader(event, 'Access-Control-Allow-Credentials', 'true')
      }

      // Invoke the handler for the method requested
      const handler = this.handlers[event.method as keyof Handlers]
      if (handler) {
        return handler.send(toWebRequest(event), context).catch(onError)
      }

      return this.write(context, event, 404, 'Not found\n')
    })
  }

  private getCorsOrigin(origin?: string): string {
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

  async write(context: CancellationContext, event: H3Event, status: number, body = '') {
    const isAborted = context.signal.aborted

    if (status !== 204) {
      setHeader(event, 'Content-Length', Buffer.byteLength(body, 'utf8'))
    }

    if (isAborted) {
      // This condition handles situations where the request has been flagged as aborted.
      // In such cases, the server informs the client that the connection will be closed.
      // This is communicated by setting the 'Connection' header to 'close' in the response.
      // This step is essential to prevent the server from continuing to process a request
      // that is no longer needed, thereby saving resources.
      setHeader(event, 'Connection', 'close')
    }

    const headers = getResponseHeaders(event) as Record<string, string>
    await event.respondWith(new Response(body, {status, headers}))

    // Abort the context once the response is sent.
    // Useful for clean-up when the server uses keep-alive
    if (!isAborted) {
      context.abort()
    }
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
      abortWithDelayController.signal.removeEventListener('abort', onDelayedAbort)
      setTimeout(() => {
        requestAbortController.abort(err)
      }, this.options.lockDrainTimeout)
    }
    abortWithDelayController.signal.addEventListener('abort', onDelayedAbort)

    // req.on('close', () => {
    //   abortWithDelayController.signal.removeEventListener('abort', onDelayedAbort)
    // })

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
