import debug from 'debug'

import {BaseHandler} from './BaseHandler'
import {Upload, Uid, Metadata} from '../models'
import {validateHeader} from '../validators/HeaderValidator'
import {EVENTS, ERRORS} from '../constants'

import type http from 'node:http'
import type {ServerOptions, WithRequired} from '../types'
import {DataStore, CancellationContext} from '../models'

const log = debug('tus-node-server:handlers:post')

export class PostHandler extends BaseHandler {
  // Overriding the `BaseHandler` type. We always set `namingFunction` in the constructor.
  options!: WithRequired<ServerOptions, 'namingFunction'>

  constructor(store: DataStore, options: ServerOptions) {
    if (options.namingFunction && typeof options.namingFunction !== 'function') {
      throw new Error("'namingFunction' must be a function")
    }

    if (!options.namingFunction) {
      options.namingFunction = Uid.rand
    }

    super(store, options)
  }

  /**
   * Create a file in the DataStore.
   */
  async send(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: CancellationContext
  ) {
    if ('upload-concat' in req.headers && !this.store.hasExtension('concatentation')) {
      throw ERRORS.UNSUPPORTED_CONCATENATION_EXTENSION
    }

    const upload_length = req.headers['upload-length'] as string | undefined
    const upload_defer_length = req.headers['upload-defer-length'] as string | undefined
    const upload_metadata = req.headers['upload-metadata'] as string | undefined

    if (
      upload_defer_length !== undefined && // Throw error if extension is not supported
      !this.store.hasExtension('creation-defer-length')
    ) {
      throw ERRORS.UNSUPPORTED_CREATION_DEFER_LENGTH_EXTENSION
    }

    if ((upload_length === undefined) === (upload_defer_length === undefined)) {
      throw ERRORS.INVALID_LENGTH
    }

    let metadata
    if ('upload-metadata' in req.headers) {
      try {
        metadata = Metadata.parse(upload_metadata)
      } catch {
        throw ERRORS.INVALID_METADATA
      }
    }

    let id
    try {
      id = await Promise.resolve(this.options.namingFunction(req, metadata))
    } catch (error) {
      log('create: check your `namingFunction`. Error', error)
      throw error
    }

    const maxFileSize = await this.getConfiguredMaxSize(req, id)

    if (
      upload_length &&
      maxFileSize > 0 &&
      Number.parseInt(upload_length, 10) > maxFileSize
    ) {
      throw ERRORS.ERR_MAX_SIZE_EXCEEDED
    }

    if (this.options.onIncomingRequest) {
      await this.options.onIncomingRequest(req, res, id)
    }

    const upload = new Upload({
      id,
      size: upload_length ? Number.parseInt(upload_length, 10) : undefined,
      offset: 0,
      metadata,
    })

    if (this.options.onUploadCreate) {
      try {
        res = await this.options.onUploadCreate(req, res, upload)
      } catch (error) {
        log(`onUploadCreate error: ${error.body}`)
        throw error
      }
    }

    const lock = await this.acquireLock(req, id, context)

    let isFinal: boolean
    let url: string
    let headers: {
      'Upload-Offset'?: string
      'Upload-Expires'?: string
    }

    try {
      await this.store.create(upload)
      url = this.generateUrl(req, upload.id)

      this.emit(EVENTS.POST_CREATE, req, res, upload, url)

      isFinal = upload.size === 0 && !upload.sizeIsDeferred
      headers = {}

      // The request MIGHT include a Content-Type header when using creation-with-upload extension
      if (validateHeader('content-type', req.headers['content-type'])) {
        const bodyMaxSize = await this.calculateMaxBodySize(req, upload, maxFileSize)
        const newOffset = await this.writeToStore(req, id, 0, bodyMaxSize, context)

        headers['Upload-Offset'] = newOffset.toString()
        isFinal = newOffset === Number.parseInt(upload_length as string, 10)
        upload.offset = newOffset
      }
    } catch (e) {
      context.abort()
      throw e
    } finally {
      await lock.unlock()
    }

    if (isFinal && this.options.onUploadFinish) {
      try {
        res = await this.options.onUploadFinish(req, res, upload)
      } catch (error) {
        log(`onUploadFinish: ${error.body}`)
        throw error
      }
    }

    // The Upload-Expires response header indicates the time after which the unfinished upload expires.
    // If expiration is known at creation time, Upload-Expires header MUST be included in the response
    if (
      this.store.hasExtension('expiration') &&
      this.store.getExpiration() > 0 &&
      upload.creation_date
    ) {
      const created = await this.store.getUpload(upload.id)

      if (created.offset !== Number.parseInt(upload_length as string, 10)) {
        const creation = new Date(upload.creation_date)
        // Value MUST be in RFC 7231 datetime format
        headers['Upload-Expires'] = new Date(
          creation.getTime() + this.store.getExpiration()
        ).toUTCString()
      }
    }

    const writtenRes = this.write(res, 201, {Location: url, ...headers})

    if (isFinal) {
      this.emit(EVENTS.POST_FINISH, req, writtenRes, upload)
    }

    return writtenRes
  }
}
