import {BaseHandler} from './BaseHandler.js'
import {ALLOWED_METHODS, MAX_AGE, HEADERS, type CancellationContext} from '@tus/utils'

// A successful response indicated by the 204 No Content status MUST contain
// the Tus-Version header. It MAY include the Tus-Extension and Tus-Max-Size headers.
export class OptionsHandler extends BaseHandler {
  async send(req: Request, context: CancellationContext, headers = new Headers()) {
    const maxSize = await this.getConfiguredMaxSize(req, null)

    headers.set('Tus-Version', '1.0.0')
    if (this.store.extensions.length > 0) {
      headers.set('Tus-Extension', this.store.extensions.join(','))
    }
    if (maxSize) {
      headers.set('Tus-Max-Size', maxSize.toString())
    }

    const allowedHeaders = [...HEADERS, ...(this.options.allowedHeaders ?? [])]
    headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS)
    headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '))
    headers.set('Access-Control-Max-Age', MAX_AGE.toString())

    return this.write(204, headers)
  }
}
