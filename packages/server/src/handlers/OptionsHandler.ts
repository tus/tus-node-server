import {BaseHandler} from './BaseHandler'
import {ALLOWED_METHODS, MAX_AGE, HEADERS} from '../constants'

import type http from 'node:http'

// A successful response indicated by the 204 No Content status MUST contain
// the Tus-Version header. It MAY include the Tus-Extension and Tus-Max-Size headers.
export class OptionsHandler extends BaseHandler {
  async send(_: http.IncomingMessage, res: http.ServerResponse) {
    const allowedHeaders = [...HEADERS, ...(this.options.allowedHeaders ?? [])]

    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '))
    res.setHeader('Access-Control-Max-Age', MAX_AGE)
    if (this.store.extensions.length > 0) {
      res.setHeader('Tus-Extension', this.store.extensions.join(','))
    }

    return this.write(res, 204, {})
  }
}
