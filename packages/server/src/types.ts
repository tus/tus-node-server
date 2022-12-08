import type http from 'node:http'

import type {Upload} from './models'

export type ServerOptions = {
  // The route to accept requests.
  path: string
  // Return a relative URL as the `Location` header.
  relativeLocation?: boolean
  // Allow `Forwarded`, `X-Forwarded-Proto`, and `X-Forwarded-Host` headers
  // to override the `Location` header returned by the server.
  respectForwardedHeaders?: boolean
  // Control how you want to name files.
  // It is important to make these unique to prevent data loss. Only use it if you really need to.
  // Default uses `crypto.randomBytes(16).toString('hex')`.
  namingFunction?: (req: http.IncomingMessage) => string
  // `onUploadCreate` will be invoked before a new upload is created.
  // If the function returns the (modified) response, the upload will be created.
  // If an error is thrown, the HTTP request will be aborted and the provided `body` and `status_code` (or their fallbacks)
  // will be sent to the client. This can be used to implement validation of upload metadata or add headers.
  onUploadCreate?: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    upload: Upload
  ) => Promise<http.ServerResponse>
  // `onUploadFinish` will be invoked after an upload is completed but before a response is returned to the client.
  // If the function returns the (modified) response, the upload will finish.
  // If an error is thrown, the HTTP request will be aborted and the provided `body` and `status_code` (or their fallbacks)
  // will be sent to the client. This can be used to implement post-processing validation.
  onUploadFinish?: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    upload: Upload
  ) => Promise<http.ServerResponse>
}

export type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void
