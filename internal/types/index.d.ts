import type http from 'node:http'

import type {
  Upload as UploadModel,
  DataStore as BaseStore,
  FileStore,
  GCSDataStore,
  S3Store,
} from '@tus/models'

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
  // `onUploadCreate` will be invoked before a new upload is created, if the
  // property is supplied. If the callback returns true, the upload will be created.
  // Otherwise the HTTP request will be aborted. This can be used to implement validation of upload metadata etc.
  onUploadCreate?: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    upload: Upload
  ) => Promise<http.ServerResponse>
  // `onUploadFinish` will be invoked after an upload is completed but before
  // a response is returned to the client. Error responses from the callback will be passed
  // back to the client. This can be used to implement post-processing validation.
  onUploadFinish?: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    upload: Upload
  ) => Promise<http.ServerResponse>
}

export type Upload = InstanceType<typeof UploadModel>

export type DataStore =
  | InstanceType<typeof BaseStore>
  | InstanceType<typeof FileStore>
  | InstanceType<typeof S3Store>
  | InstanceType<typeof GCSDataStore>

export type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void
