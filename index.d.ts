import {EventEmitter} from 'events'
import * as http from 'http'

declare interface Configstore {
  get(key: string): Promise<IFile | undefined> | IFile | undefined
  set(key: string, value: IFile): Promise<void> | void
  delete(key: string): Promise<boolean> | boolean
}

declare interface ServerOptions {
  path: string
  relativeLocation?: boolean
  namingFunction?: () => string
}

/**
 * Arguments of constructor which in class extend DataStore
 */

declare interface FileStoreOptions {
  directory: string
  configstore?: Configstore
}

declare interface GCStoreOptions {
  bucket: string
  projectId: string
  keyFilename: string
}

declare interface S3StoreOptions {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region?: string
  partSize: number
}

declare interface IFile {
  id: string
  upload_length: string
  upload_defer_length: string
  upload_metadata: string
  size: number
}

declare class File {
  constructor(
    file_id: string,
    upload_length: string,
    upload_defer_length: string,
    upload_metadata: string
  )
}

/**
 * Based store for all DataStore classes.
 */
export declare class DataStore extends EventEmitter {
  constructor()
  // TODO: get and set should both be string[]
  // @ts-expect-error The return type of a 'get' accessor must be assignable to its 'set' accessor type
  get extensions(): string
  set extensions(extensions_array: string[])
  hasExtension(extension: string): boolean
  create(file: File): Promise<IFile>
  remove(file_id: string): Promise<any>
  write(stream: ReadableStream, file_id: string, offset: number): Promise<number>
  getOffset(file_id: string): Promise<IFile>
}

export declare class DeferableLengthDatastore extends DataStore {
  declareUploadLength(file_id: string, upload_length: string): Promise<undefined>
}

/**
 * File store in local storage
 */
export declare class FileStore extends DeferableLengthDatastore {
  constructor(options: FileStoreOptions)
  read(file_id: string): ReadableStream
}

/**
 * File store in Google Cloud
 */
export declare class GCSDataStore extends DataStore {
  constructor(options: GCStoreOptions)
}

/**
 * File store in AWS S3
 */
export declare class S3Store extends DataStore {
  constructor(options: S3StoreOptions)
}

/**
 * Tus protocol server implements
 */
export declare class Server extends EventEmitter {
  constructor(options: ServerOptions)
  get datastore(): DataStore
  set datastore(store: DataStore)
  get(path: string, callback: (...args: any[]) => any): any
  handle(req: http.IncomingMessage, res: http.ServerResponse): http.ServerResponse
  listen(): http.Server
}

export declare const EVENTS: {
  EVENT_ENDPOINT_CREATED: string
  EVENT_FILE_CREATED: string
  EVENT_UPLOAD_COMPLETE: string
}

export declare const ERRORS: {
  MISSING_OFFSET: {
    status_code: number
    body: string
  }
  INVALID_CONTENT_TYPE: {
    status_code: number
    body: string
  }
  FILE_NOT_FOUND: {
    status_code: number
    body: string
  }
  INVALID_PATH: {
    status_code: number
    body: string
  }
  INVALID_OFFSET: {
    status_code: number
    body: string
  }
  FILE_NO_LONGER_EXISTS: {
    status_code: number
    body: string
  }
  INVALID_LENGTH: {
    status_code: number
    body: string
  }
  UNKNOWN_ERROR: {
    status_code: number
    body: string
  }
  FILE_WRITE_ERROR: {
    status_code: number
    body: string
  }
}

export declare class Metadata {
  static parse(str: string): Record<string, string>
  static stringify(metadata: Record<string, string>): string
}
