import stream from 'node:stream'

import {BaseHandler} from './BaseHandler'
import {ERRORS} from '../constants'

import type http from 'node:http'
import type {RouteHandler} from '../types'

export class GetHandler extends BaseHandler {
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

    const id = this.getFileIdFromRequest(req)
    if (id === false) {
      throw ERRORS.FILE_NOT_FOUND
    }

    const stats = await this.store.getUpload(id)
    if (!stats || stats.offset !== stats.size) {
      throw ERRORS.FILE_NOT_FOUND
    }

    // @ts-expect-error exists if supported
    const file_stream = this.store.read(id)
    const headers = {'Content-Length': stats.offset}
    res.writeHead(200, headers)
    return stream.pipeline(file_stream, res, () => {
      // We have no need to handle streaming errors
    })
  }
}
