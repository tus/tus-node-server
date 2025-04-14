import EventEmitter from 'node:events'

import type {ServerOptions} from '../types.js'
import type {DataStore, CancellationContext} from '@tus/utils'
import {ERRORS, type Upload, StreamLimiter, EVENTS} from '@tus/utils'
import throttle from 'lodash.throttle'
import stream from 'node:stream/promises'
import {PassThrough, Readable} from 'node:stream'

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

  write(status: number, headers = {}, body?: string) {
    const res = new Response(status === 204 ? null : body, {headers, status})
    if (status !== 204 && body) {
      res.headers.set('Content-Length', Buffer.byteLength(body, 'utf8').toString())
    }
    return res
  }

  generateUrl(req: Request, id: string) {
    const path = this.options.path === '/' ? '' : this.options.path

    if (this.options.generateUrl) {
      // user-defined generateUrl function
      const {proto, host} = BaseHandler.extractHostAndProto(
        req.headers,
        this.options.respectForwardedHeaders
      )

      return this.options.generateUrl(req, {
        proto,
        host,
        path: path,
        id,
      })
    }

    // Default implementation
    if (this.options.relativeLocation) {
      return `${path}/${id}`
    }

    const {proto, host} = BaseHandler.extractHostAndProto(
      req.headers,
      this.options.respectForwardedHeaders
    )

    return `${proto}://${host}${path}/${id}`
  }

  getFileIdFromRequest(req: Request) {
    const match = reExtractFileID.exec(req.url as string)

    if (this.options.getFileIdFromRequest) {
      const lastPath = match ? decodeURIComponent(match[1]) : undefined
      return this.options.getFileIdFromRequest(req, lastPath)
    }

    if (!match || this.options.path.includes(match[1])) {
      return
    }

    return decodeURIComponent(match[1])
  }

  static extractHostAndProto(headers: Headers, respectForwardedHeaders?: boolean) {
    let proto: string | undefined
    let host: string | undefined

    if (respectForwardedHeaders) {
      const forwarded = headers.get('forwarded')
      if (forwarded) {
        host ??= reForwardedHost.exec(forwarded)?.[1]
        proto ??= reForwardedProto.exec(forwarded)?.[1]
      }

      const forwardHost = headers.get('x-forwarded-host')
      const forwardProto = headers.get('x-forwarded-proto')

      // @ts-expect-error we can pass undefined
      if (['http', 'https'].includes(forwardProto)) {
        proto ??= forwardProto as string
      }

      host ??= forwardHost as string
    }

    host ??= headers.get('host') as string
    proto ??= 'http'

    return {host, proto}
  }

  protected async getLocker(req: Request) {
    if (typeof this.options.locker === 'function') {
      return this.options.locker(req)
    }
    return this.options.locker
  }

  protected async acquireLock(req: Request, id: string, context: CancellationContext) {
    const locker = await this.getLocker(req)

    const lock = locker.newLock(id)

    await lock.lock(context.signal, () => {
      context.cancel()
    })

    return lock
  }

  protected writeToStore(
    webStream: ReadableStream | null,
    upload: Upload,
    maxFileSize: number,
    context: CancellationContext
  ) {
    // biome-ignore lint/suspicious/noAsyncPromiseExecutor: <explanation>
    return new Promise<number>(async (resolve, reject) => {
      // Abort early if the operation has been cancelled.
      if (context.signal.aborted) {
        reject(ERRORS.ABORTED)
        return
      }

      // Create a PassThrough stream as a proxy to manage the request stream.
      // This allows for aborting the write process without affecting the incoming request stream.
      const proxy = new PassThrough()
      const nodeStream = webStream ? Readable.fromWeb(webStream) : Readable.from([])

      // Ignore errors on the data stream to prevent crashes from client disconnections
      // We handle errors on the proxy stream instead.
      nodeStream.on('error', (err) => {
        /* do nothing */
      })

      // gracefully terminate the proxy stream when the request is aborted
      const onAbort = () => {
        nodeStream.unpipe(proxy)

        if (!proxy.closed) {
          proxy.end()
        }
      }
      context.signal.addEventListener('abort', onAbort, {once: true})

      proxy.on('error', (err) => {
        nodeStream.unpipe(proxy)
        reject(err.name === 'AbortError' ? ERRORS.ABORTED : err)
      })

      const postReceive = throttle(
        (offset: number) => {
          this.emit(EVENTS.POST_RECEIVE, nodeStream, {...upload, offset})
        },
        this.options.postReceiveInterval,
        {leading: false}
      )

      let tempOffset = upload.offset
      proxy.on('data', (chunk: Buffer) => {
        tempOffset += chunk.byteLength
        postReceive(tempOffset)
      })

      // Pipe the request stream through the proxy. We use the proxy instead of the request stream directly
      // to ensure that errors in the pipeline do not cause the request stream to be destroyed,
      // which would result in a socket hangup error for the client.
      stream
        .pipeline(
          nodeStream.pipe(proxy),
          new StreamLimiter(maxFileSize),
          async (stream) => {
            return this.store.write(stream as StreamLimiter, upload.id, upload.offset)
          }
        )
        .then(resolve)
        .catch(reject)
        .finally(() => {
          context.signal.removeEventListener('abort', onAbort)
        })
    })
  }

  getConfiguredMaxSize(req: Request, id: string | null) {
    if (typeof this.options.maxSize === 'function') {
      return this.options.maxSize(req, id)
    }
    return this.options.maxSize ?? 0
  }

  /**
   * Calculates the maximum allowed size for the body of an upload request.
   * This function considers both the server's configured maximum size and
   * the specifics of the upload, such as whether the size is deferred or fixed.
   */
  async calculateMaxBodySize(req: Request, file: Upload, configuredMaxSize?: number) {
    // Use the server-configured maximum size if it's not explicitly provided.
    configuredMaxSize ??= await this.getConfiguredMaxSize(req, file.id)

    // Parse the Content-Length header from the request (default to 0 if not set).
    const length = Number.parseInt(req.headers.get('content-length') || '0', 10)
    const offset = file.offset

    const hasContentLengthSet = req.headers.get('content-length') !== null
    const hasConfiguredMaxSizeSet = configuredMaxSize > 0

    if (file.sizeIsDeferred) {
      // For deferred size uploads, if it's not a chunked transfer, check against the configured maximum size.
      if (
        hasContentLengthSet &&
        hasConfiguredMaxSizeSet &&
        offset + length > configuredMaxSize
      ) {
        throw ERRORS.ERR_SIZE_EXCEEDED
      }

      if (hasConfiguredMaxSizeSet) {
        return configuredMaxSize - offset
      }
      return Number.MAX_SAFE_INTEGER
    }

    // Check if the upload fits into the file's size when the size is not deferred.
    if (offset + length > (file.size || 0)) {
      throw ERRORS.ERR_SIZE_EXCEEDED
    }

    if (hasContentLengthSet) {
      return length
    }

    return (file.size || 0) - offset
  }
}
