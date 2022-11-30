import type http from 'node:http'
import type {EventEmitter} from 'node:events'

import UploadModel from '../lib/models/Upload'

import BaseStore from '../lib/stores/DataStore'
import FileStore from '../lib/stores/FileStore'
import GCSDataStore from '../lib/stores/GCSDataStore'
import S3Store from '../lib/stores/S3Store'

import {EVENTS} from '../lib/constants'

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
  onUploadCreate?: (req: http.IncomingMessage, upload: Upload) => Promise<void>
  // `onUploadFinish` will be invoked after an upload is completed but before
  // a response is returned to the client. Error responses from the callback will be passed
  // back to the client. This can be used to implement post-processing validation.
  onUploadFinish?: (req: http.IncomingMessage, upload: Upload) => Promise<void>
}

export interface TusEvents {
  [EVENTS.POST_CREATE]: (req: http.IncomingMessage, upload: Upload, id: string) => void
  [EVENTS.POST_FINISH]: (req: http.IncomingMessage, upload: Upload) => void
  [EVENTS.POST_TERMINATE]: (req: http.IncomingMessage, id: string) => void
}

export interface Events {
  on<Event extends keyof TusEvents>(event: Event, listener: TusEvents[Event]): this
  // We could get the type of the method `on` but setting that won't work with overloading.
  on(
    eventName: Parameters<EventEmitter['on']>[0],
    listener: Parameters<EventEmitter['on']>[1]
  ): ReturnType<EventEmitter['on']>

  emit<Event extends keyof TusEvents>(
    event: Event,
    listener: TusEvents[Event]
  ): ReturnType<EventEmitter['emit']>
  emit(
    eventName: Parameters<EventEmitter['emit']>[0],
    listener: Parameters<EventEmitter['emit']>[1]
  ): ReturnType<EventEmitter['emit']>
}

export type Upload = InstanceType<typeof UploadModel>

export type DataStore =
  | InstanceType<typeof BaseStore>
  | InstanceType<typeof FileStore>
  | InstanceType<typeof S3Store>
  | InstanceType<typeof GCSDataStore>

export type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void
