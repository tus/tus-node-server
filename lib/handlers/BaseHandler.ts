import EventEmitter from 'node:events'

class BaseHandler extends EventEmitter {
  options: any
  store: any
  constructor(store: any, options: any) {
    super()
    if (!store) {
      throw new Error('Store must be defined')
    }
    this.store = store
    this.options = options
  }
  /**
   * Wrapper on http.ServerResponse.
   *
   * @param  {object} res http.ServerResponse
   * @param  {integer} status
   * @param  {object} headers
   * @param  {string} body
   * @return {ServerResponse}
   */
  write(res: any, status: any, headers = {}, body: any) {
    body = body ? body : ''
    headers = status === 204 ? headers : { ...headers, 'Content-Length': body.length }
    res.writeHead(status, headers)
    res.write(body)
    return res.end()
  }
  generateUrl(req: any, file_id: any) {
    return this.options.relativeLocation
      ? `${req.baseUrl || ''}${this.options.path}/${file_id}`
      : `//${req.headers.host}${req.baseUrl || ''}${this.options.path}/${file_id}`
  }
  /**
   * Extract the file id from the request
   *
   * @param  {object} req http.incomingMessage
   * @return {bool|string}
   */
  getFileIdFromRequest(req: any) {
    const re = new RegExp(`${req.baseUrl || ''}${this.options.path}\\/(\\S+)\\/?`) // eslint-disable-line prefer-template
    const match = (req.originalUrl || req.url).match(re)
    if (!match) {
      return false
    }
    const file_id = match[1]
    return file_id
  }
}
export default BaseHandler
