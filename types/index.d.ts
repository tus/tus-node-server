import type http from 'node:http'
import UploadModel from '../lib/models/Upload'

import BaseStore from '../lib/stores/DataStore'
import FileStore from '../lib/stores/FileStore'
import GCSDataStore from '../lib/stores/GCSDataStore'
import S3Store from '../lib/stores/S3Store'

export type ServerOptions = {
  path: string
  relativeLocation?: boolean
  namingFunction?: (req: http.IncomingMessage) => string
}

export type Upload = InstanceType<typeof UploadModel>

export type DataStore =
  | InstanceType<typeof BaseStore>
  | InstanceType<typeof FileStore>
  | InstanceType<typeof S3Store>
  | InstanceType<typeof GCSDataStore>

export type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void
