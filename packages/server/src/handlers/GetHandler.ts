import stream from 'node:stream'

import {BaseHandler} from './BaseHandler'
import {ERRORS, type Upload} from '@tus/utils'

import type http from 'node:http'
import type {RouteHandler} from '../types'

export class GetHandler extends BaseHandler {
  paths: Map<string, RouteHandler> = new Map()

  /**
   * reMimeType is a RegExp for check mime-type form compliance with RFC1341
   * for support mime-type and extra parameters, for example:
   *
   * ```
   * text/plain; charset=utf-8
   * ```
   *
   * See: https://datatracker.ietf.org/doc/html/rfc1341 (Page 6)
   */
  reMimeType =
    // biome-ignore lint/suspicious/noControlCharactersInRegex: it's fine
    /^(?:application|audio|example|font|haptics|image|message|model|multipart|text|video|x-(?:[0-9A-Za-z!#$%&'*+.^_`|~-]+))\/([0-9A-Za-z!#$%&'*+.^_`|~-]+)((?:[ 	]*;[ 	]*[0-9A-Za-z!#$%&'*+.^_`|~-]+=(?:[0-9A-Za-z!#$%&'*+.^_`|~-]+|"(?:[^"\\]|\.)*"))*)$/

  /**
   * mimeInlineBrowserWhitelist is a set containing MIME types which should be
   * allowed to be rendered by browser inline, instead of being forced to be
   * downloaded. For example, HTML or SVG files are not allowed, since they may
   * contain malicious JavaScript. In a similar fashion PDF is not on this list
   * as their parsers commonly contain vulnerabilities which can be exploited.
   */
  mimeInlineBrowserWhitelist = new Set([
    'text/plain',

    'image/png',
    'image/jpeg',
    'image/gif',
    'image/bmp',
    'image/webp',

    'audio/wave',
    'audio/wav',
    'audio/x-wav',
    'audio/x-pn-wav',
    'audio/webm',
    'audio/ogg',

    'video/mp4',
    'video/webm',
    'video/ogg',

    'application/ogg',
  ])

  registerPath(path: string, handler: RouteHandler): void {
    this.paths.set(path, handler)
  }

  /**
   * Read data from the DataStore and send the stream.
   */
  async send(
    req: http.IncomingMessage,
    res: http.ServerResponse
    // biome-ignore lint/suspicious/noConfusingVoidType: it's fine
  ): Promise<stream.Writable | void> {
    if (this.paths.has(req.url as string)) {
      const handler = this.paths.get(req.url as string) as RouteHandler
      return handler(req, res)
    }

    if (!('read' in this.store)) {
      throw ERRORS.FILE_NOT_FOUND
    }

    const id = this.getFileIdFromRequest(req)
    if (!id) {
      throw ERRORS.FILE_NOT_FOUND
    }

    if (this.options.onIncomingRequest) {
      await this.options.onIncomingRequest(req, res, id)
    }

    const stats = await this.store.getUpload(id)

    if (!stats || stats.offset !== stats.size) {
      throw ERRORS.FILE_NOT_FOUND
    }

    const {contentType, contentDisposition} = this.filterContentType(stats)

    // @ts-expect-error exists if supported
    const file_stream = await this.store.read(id)
    const headers = {
      'Content-Length': stats.offset,
      'Content-Type': contentType,
      'Content-Disposition': contentDisposition,
    }
    res.writeHead(200, headers)
    return stream.pipeline(file_stream, res, () => {
      // We have no need to handle streaming errors
    })
  }

  /**
   * filterContentType returns the values for the Content-Type and
   * Content-Disposition headers for a given upload. These values should be used
   * in responses for GET requests to ensure that only non-malicious file types
   * are shown directly in the browser. It will extract the file name and type
   * from the "filename" and "filetype".
   * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition
   */
  filterContentType(stats: Upload): {
    contentType: string
    contentDisposition: string
  } {
    let contentType: string
    let contentDisposition: string

    const {filetype, filename} = stats.metadata ?? {}

    if (filetype && this.reMimeType.test(filetype)) {
      // If the filetype from metadata is well formed, we forward use this
      // for the Content-Type header. However, only whitelisted mime types
      // will be allowed to be shown inline in the browser
      contentType = filetype

      if (this.mimeInlineBrowserWhitelist.has(filetype)) {
        contentDisposition = 'inline'
      } else {
        contentDisposition = 'attachment'
      }
    } else {
      // If the filetype from the metadata is not well formed, we use a
      // default type and force the browser to download the content
      contentType = 'application/octet-stream'
      contentDisposition = 'attachment'
    }

    // Add a filename to Content-Disposition if one is available in the metadata
    if (filename) {
      contentDisposition += `; filename=${this.quote(filename)}`
    }

    return {
      contentType,
      contentDisposition,
    }
  }

  /**
   * Convert string to quoted string literals
   */
  quote(value: string) {
    return `"${value.replace(/"/g, '\\"')}"`
  }
}
