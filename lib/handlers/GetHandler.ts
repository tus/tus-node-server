import stream from 'node:stream'
import debug from 'debug'

import BaseHandler from './BaseHandler'
import {ERRORS} from '../constants'

import type http from 'node:http'
import type {RouteHandler} from '../../types'

const log = debug('tus-node-server:handlers:get')

export default class GetHandler extends BaseHandler {
  paths: Map<string, RouteHandler> = new Map()

  registerPath(path: string, handler: RouteHandler): void {
    this.paths.set(path, handler)
  }

  /**
   * Read data from the DataStore and send the stream.
   */
  async send(
    req: http.IncomingMessage,
    res: http.ServerResponse
    // TODO: always return void or a stream?
  ): Promise<stream.Writable | void> {
    if (this.paths.has(req.url as string)) {
      const handler = this.paths.get(req.url as string) as RouteHandler
      return handler(req, res)
    }

    if (!('read' in this.store)) {
      throw ERRORS.FILE_NOT_FOUND
    }

    const file_id = this.getFileIdFromRequest(req)
    if (file_id === false) {
      throw ERRORS.FILE_NOT_FOUND
    }

    const stats = await this.store.getUpload(file_id)
    const upload_length = Number.parseInt(stats.upload_length as string, 10)
    if (stats.size !== upload_length) {
      log(
        `[GetHandler] send: File is not yet fully uploaded (${stats.size}/${upload_length})`
      )
      throw ERRORS.FILE_NOT_FOUND
    }

    const file_stream = this.store.read(file_id)
    const headers = {'Content-Length': stats.size}
    res.writeHead(200, headers)
    return stream.pipeline(file_stream, res, () => {
      // We have no need to handle streaming errors
    })
  }
}
