import http from 'node:http'
import {EventEmitter} from 'node:events'

import type {ServerRequest} from 'srvx'
import {toNodeHandler} from 'srvx/node'
import debug from 'debug'
import {EVENTS, ERRORS, REQUEST_METHODS, TUS_RESUMABLE, HEADERS} from '@tus/utils'
import type {DataStore, Upload, CancellationContext} from '@tus/utils'

import {GetHandler} from './handlers/GetHandler.js'
import {HeadHandler} from './handlers/HeadHandler.js'
import {OptionsHandler} from './handlers/OptionsHandler.js'
import {PatchHandler} from './handlers/PatchHandler.js'
import {PostHandler} from './handlers/PostHandler.js'
import {DeleteHandler} from './handlers/DeleteHandler.js'
import {validateHeader} from './validators/HeaderValidator.js'
import type {ServerOptions, RouteHandler, WithOptional} from './types.js'
import {MemoryLocker} from './lockers/index.js'

type Handlers = {
  GET: InstanceType<typeof GetHandler>
  HEAD: InstanceType<typeof HeadHandler>
  OPTIONS: InstanceType<typeof OptionsHandler>
  PATCH: InstanceType<typeof PatchHandler>
  POST: InstanceType<typeof PostHandler>
  DELETE: InstanceType<typeof DeleteHandler>
}

interface TusEvents {
  [EVENTS.POST_CREATE]: (req: ServerRequest, upload: Upload, url: string) => void
  [EVENTS.POST_RECEIVE]: (req: ServerRequest, upload: Upload) => void
  [EVENTS.POST_FINISH]: (req: ServerRequest, res: Response, upload: Upload) => void
  [EVENTS.POST_TERMINATE]: (req: ServerRequest, res: Response, id: string) => void
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
    this.handlers.GET.registerPath(path, handler)
  }

  async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    return toNodeHandler(this.handler.bind(this))(req, res)
  }

  async handleWeb(req: Request) {
    return this.handler(req)
  }

  private async handler(req: Request | ServerRequest) {
    const context = this.createContext()
    const headers = new Headers()

    // Special case on the Node.js runtime,
    // We handle gracefully request errors such as disconnects or timeouts.
    // This is important to avoid memory leaks and ensure that the server can
    // handle subsequent requests without issues.
    if ((req as ServerRequest)?.runtime?.node) {
      // biome-ignore lint/style/noNonNullAssertion: it's fine
      const node = (req as ServerRequest).runtime?.node!
      // @ts-expect-error backwards compatibility. srvx moved req.node to req.runtime.node.
      req.node = node
      node.req.once('error', () => {
        context.abort()
      })
    }

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
      context.abort()
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
    const invalid_headers: string[] = []
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
    headers.set(
      'Access-Control-Expose-Headers',
      [...HEADERS, this.options.exposedHeaders ?? []].join(', ')
    )

    if (this.options.allowedCredentials === true) {
      headers.set('Access-Control-Allow-Credentials', 'true')
    }

    // Invoke the handler for the method requested
    const handler = this.handlers[req.method as keyof Handlers]
    if (handler) {
      const resp = await handler.send(req, context, headers).catch(onError)

      if (context.signal.aborted) {
        // If the request was aborted, we should not send any response body.
        // The server should just close the connection.
        resp.headers.set('Connection', 'close')
        return resp
      }

      return resp
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

  // biome-ignore lint/suspicious/noExplicitAny: it's fine
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
