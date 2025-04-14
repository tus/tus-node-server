import debug from 'debug'
import {Readable} from 'node:stream'

import {BaseHandler} from './BaseHandler.js'
import {
  Upload,
  Uid,
  Metadata,
  EVENTS,
  ERRORS,
  type DataStore,
  type CancellationContext,
} from '@tus/utils'
import {validateHeader} from '../validators/HeaderValidator.js'

import type {ServerOptions, WithRequired} from '../types.js'

const log = debug('tus-node-server:handlers:post')

export class PostHandler extends BaseHandler {
  // Overriding the `BaseHandler` type. We always set `namingFunction` in the constructor.
  declare options: WithRequired<ServerOptions, 'namingFunction'>

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
  async send(req: Request, context: CancellationContext, headers = new Headers()) {
    if (req.headers.get('upload-concat') && !this.store.hasExtension('concatentation')) {
      throw ERRORS.UNSUPPORTED_CONCATENATION_EXTENSION
    }

    const upload_length = req.headers.get('upload-length')
    const upload_defer_length = req.headers.get('upload-defer-length')
    const upload_metadata = req.headers.get('upload-metadata')

    if (
      upload_defer_length !== null && // Throw error if extension is not supported
      !this.store.hasExtension('creation-defer-length')
    ) {
      throw ERRORS.UNSUPPORTED_CREATION_DEFER_LENGTH_EXTENSION
    }

    if ((upload_length === null) === (upload_defer_length === null)) {
      throw ERRORS.INVALID_LENGTH
    }

    let metadata: ReturnType<(typeof Metadata)['parse']> | undefined
    if (upload_metadata) {
      try {
        metadata = Metadata.parse(upload_metadata ?? undefined)
      } catch {
        throw ERRORS.INVALID_METADATA
      }
    }

    let id: string
    try {
      id = await this.options.namingFunction(req, metadata)
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
      await this.options.onIncomingRequest(req, id)
    }

    const upload = new Upload({
      id,
      size: upload_length ? Number.parseInt(upload_length, 10) : undefined,
      offset: 0,
      metadata,
    })

    if (this.options.onUploadCreate) {
      try {
        const patch = await this.options.onUploadCreate(req, upload)
        if (patch.metadata) {
          upload.metadata = patch.metadata
        }
      } catch (error) {
        log(`onUploadCreate error: ${error.body}`)
        throw error
      }
    }

    const lock = await this.acquireLock(req, id, context)

    let isFinal: boolean
    let url: string

    //Recommended response defaults
    const responseData = {
      status: 201,
      headers: Object.fromEntries(headers.entries()),
      body: '',
    }

    try {
      await this.store.create(upload)
      url = this.generateUrl(req, upload.id)

      this.emit(EVENTS.POST_CREATE, req, upload, url)

      isFinal = upload.size === 0 && !upload.sizeIsDeferred

      // The request MIGHT include a Content-Type header when using creation-with-upload extension
      if (validateHeader('content-type', req.headers.get('content-type'))) {
        const bodyMaxSize = await this.calculateMaxBodySize(req, upload, maxFileSize)
        const newOffset = await this.writeToStore(req.body, upload, bodyMaxSize, context)

        responseData.headers['Upload-Offset'] = newOffset.toString()
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
        const patch = await this.options.onUploadFinish(req, upload)
        if (patch.status_code) responseData.status = patch.status_code
        if (patch.body) responseData.body = patch.body
        if (patch.headers)
          responseData.headers = Object.assign(patch.headers, responseData.headers)
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
        responseData.headers['Upload-Expires'] = new Date(
          creation.getTime() + this.store.getExpiration()
        ).toUTCString()
      }
    }

    //Only append Location header if its valid for the final http status (201 or 3xx)
    if (
      responseData.status === 201 ||
      (responseData.status >= 300 && responseData.status < 400)
    ) {
      responseData.headers.Location = url
    }

    const writtenRes = this.write(
      responseData.status,
      responseData.headers,
      responseData.body
    )

    if (isFinal) {
      this.emit(EVENTS.POST_FINISH, req, writtenRes, upload)
    }

    return writtenRes
  }
}
