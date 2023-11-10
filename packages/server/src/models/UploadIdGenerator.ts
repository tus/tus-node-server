import http from 'node:http'

export interface UploadIdGenerator {
  generateUrl(req: http.IncomingMessage, id: string): string
  getFileIdFromRequest(req: http.IncomingMessage): string | false
}

export interface DefaultUploadIdGeneratorOptions {
  path: string
  relativeLocation?: boolean
  respectForwardedHeaders?: boolean
}

const reExtractFileID = /([^/]+)\/?$/
const reForwardedHost = /host="?([^";]+)/
const reForwardedProto = /proto=(https?)/

export class DefaultUploadIdGenerator implements UploadIdGenerator {
  constructor(private readonly options: DefaultUploadIdGeneratorOptions) {}

  generateUrl(req: http.IncomingMessage, id: string): string {
    id = encodeURIComponent(id)

    const forwarded = req.headers.forwarded as string | undefined
    const path = this.options.path === '/' ? '' : this.options.path
    // @ts-expect-error baseUrl type doesn't exist?
    const baseUrl = req.baseUrl ?? ''
    let proto
    let host

    if (this.options.relativeLocation) {
      return `${baseUrl}${path}/${id}`
    }

    if (this.options.respectForwardedHeaders) {
      if (forwarded) {
        host ??= reForwardedHost.exec(forwarded)?.[1]
        proto ??= reForwardedProto.exec(forwarded)?.[1]
      }

      const forwardHost = req.headers['x-forwarded-host']
      const forwardProto = req.headers['x-forwarded-proto']

      // @ts-expect-error we can pass undefined
      if (['http', 'https'].includes(forwardProto)) {
        proto ??= forwardProto as string
      }

      host ??= forwardHost
    }

    host ??= req.headers.host
    proto ??= 'http'

    return `${proto}://${host}${baseUrl}${path}/${id}`
  }

  getFileIdFromRequest(req: http.IncomingMessage) {
    const match = reExtractFileID.exec(req.url as string)

    if (!match || this.options.path.includes(match[1])) {
      return false
    }

    return decodeURIComponent(match[1])
  }
}
