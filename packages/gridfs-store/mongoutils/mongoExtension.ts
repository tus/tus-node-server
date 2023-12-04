import {Writable} from 'stream'
import {
  GridFSFile,
  GridFSChunk,
  Collection,
  GridFSBucketWriteStreamOptions,
  WriteConcern,
  AnyError,
  MongoError,
  MongoAPIError,
  Document,
  ReadPreference,
  GridFSBucketOptions,
  Db,
} from 'mongodb'
import {GridFSBucket} from 'mongodb'
import {ObjectId} from 'mongodb'

export interface GridFSBucketPrivate {
  db: Db
  options: {
    bucketName: string
    chunkSizeBytes: number
    readPreference?: ReadPreference
    writeConcern: WriteConcern | undefined
  }
  _chunksCollection: Collection<GridFSChunk>
  _filesCollection: Collection<GridFSFile>
  checkedIndexes: boolean
  calledOpenUploadStream: boolean
}
export const MONGODB_ERROR_CODES = Object.freeze({
  HostUnreachable: 6,
  HostNotFound: 7,
  NetworkTimeout: 89,
  ShutdownInProgress: 91,
  PrimarySteppedDown: 189,
  ExceededTimeLimit: 262,
  SocketException: 9001,
  NotWritablePrimary: 10107,
  InterruptedAtShutdown: 11600,
  InterruptedDueToReplStateChange: 11602,
  NotPrimaryNoSecondaryOk: 13435,
  NotPrimaryOrSecondary: 13436,
  StaleShardVersion: 63,
  StaleEpoch: 150,
  StaleConfig: 13388,
  RetryChangeStream: 234,
  FailedToSatisfyReadPreference: 133,
  CursorNotFound: 43,
  LegacyNotPrimary: 10058,
  WriteConcernFailed: 64,
  NamespaceNotFound: 26,
  IllegalOperation: 20,
  MaxTimeMSExpired: 50,
  UnknownReplWriteConcern: 79,
  UnsatisfiableWriteConcern: 100,
  Reauthenticate: 391,
} as const)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Callback<T = any> = (error?: AnyError, result?: T) => void
export class GridFsBucketUpdateStream extends Writable {
  bucket: GridFsBucketExtended
  /** A Collection instance where the file's chunks are stored */
  chunks: Collection<GridFSChunk>
  /** A Collection instance where the file's GridFSFile document is stored */
  files: Collection<GridFSFile>
  /** The name of the file */
  filename: string
  /** Options controlling the metadata inserted along with the file */
  options: GridFSBucketWriteStreamOptions
  /** Indicates the stream is finished uploading */
  done: boolean
  /** The ObjectId used for the `_id` field on the GridFSFile document to update */
  id: ObjectId
  /** The number of bytes that each chunk will be limited to */
  chunkSizeBytes: number
  /** Space used to store a chunk currently being inserted */
  bufToStore: Buffer
  /** Accumulates the number of bytes inserted as the stream uploads chunks */
  length: number
  /** Accumulates the number of chunks inserted as the stream uploads file contents */
  n: number
  /** Tracks the current offset into the buffered bytes being uploaded */
  pos: number
  /** Contains a number of properties indicating the current state of the stream */

  state: {
    /** If set the stream has ended */
    streamEnd: boolean
    /** Indicates the number of chunks that still need to be inserted to exhaust the current buffered data */
    outstandingRequests: number
    /** If set an error occurred during insertion */
    errored: boolean
    /** If set the stream was intentionally aborted */
    aborted: boolean
  }
  /** The write concern setting to be used with every insert operation */
  writeConcern?: WriteConcern
  /**  a hint of the current of the of the previous file*/
  gridFSFile: GridFSFile | null = null
  /** hint to the current offset of the previous document */
  offset?: number
  fileSizeHint?: number
  isPaused = false
  /**byteswritten to the database */
  bytesWritten: number

  /** bytesRecieved */

  constructor(
    bucket: GridFsBucketExtended,
    filename: string,
    options?: GridFSBucketWriteStreamOptions & {
      chunkCount?: number
      offset?: number
      fileSizeHint?: number
      paused?: boolean
    }
  ) {
    super()

    options = options ?? {}
    this.bucket = bucket
    this.chunks = bucket.s._chunksCollection
    this.filename = filename
    this.files = bucket.s._filesCollection
    this.options = options
    this.writeConcern = WriteConcern.fromOptions(options) || bucket.s.options.writeConcern
    // Signals the write is all done
    this.done = false

    this.id = options.id ? options.id : new ObjectId()
    // properly inherit the default chunksize from parent
    this.chunkSizeBytes = options.chunkSizeBytes || this.bucket.s.options.chunkSizeBytes
    this.bufToStore = Buffer.alloc(this.chunkSizeBytes)
    this.length = 0
    this.pos = 0
    this.n = options.chunkCount || 0
    this.fileSizeHint = options.fileSizeHint
    this.isPaused = options.paused ? options.paused : this.isPaused
    this.bytesWritten = options.offset || 0

    this.state = {
      streamEnd: false,

      outstandingRequests: 0,
      errored: false,
      aborted: false,
    }
    this.offset = options.offset

    if (!this.bucket.s.calledOpenUploadStream) {
      this.bucket.s.calledOpenUploadStream = true

      checkIndexes(this).then(
        () => {
          this.bucket.s.checkedIndexes = true
          this.bucket.emit('index')
        },
        () => null
      )
    }
  }

  public get bytesRecieved(): number {
    return this.length
  }
  /**
   * @internal
   *
   * The stream is considered constructed when the indexes are done being created
   */
  override _construct(callback: (error?: Error | null) => void): void {
    if (this.bucket.s.checkedIndexes) {
      return process.nextTick(callback)
    }
    this.bucket.once('index', callback)
  }

  /**
   * @internal
   * Write a buffer to the stream.
   *
   * @param chunk - Buffer to write
   * @param encoding - Optional encoding for the buffer
   * @param callback - Function to call when the chunk was added to the buffer, or if the entire chunk was persisted to MongoDB if this chunk caused a flush.
   */
  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: Callback<void>
  ): void {
    doWrite(this, chunk, encoding, callback)
  }

  /** @internal */
  override _final(callback: (error?: Error | null) => void): void {
    if (this.state.streamEnd) {
      return process.nextTick(callback)
    }
    this.state.streamEnd = true
    writeRemnant(this, callback)
  }

  pause(callback: (error?: Error | null) => void): void {
    this.isPaused = true
    // finished streaming;
    this.state.streamEnd = true
    this.state.outstandingRequests = 0
    this.state.errored = false

    checkDone(this, callback)
  }

  /**
   * Places this write stream into an aborted state (all future writes fail)
   * and deletes all chunks that have already been written.
   */
  async abort(): Promise<void> {
    if (this.state.streamEnd) {
      // TODO(NODE-3485): Replace with MongoGridFSStreamClosed
      throw new MongoAPIError('Cannot abort a stream that has already completed')
    }

    if (this.state.aborted) {
      // TODO(NODE-3485): Replace with MongoGridFSStreamClosed
      throw new MongoAPIError('Cannot call abort() on a stream twice')
    }

    this.state.aborted = true
    await this.chunks.deleteMany({files_id: this.id})
  }
}

function handleError(
  stream: GridFsBucketUpdateStream,
  error: Error,
  callback: Callback
): void {
  if (stream.state.errored) {
    process.nextTick(callback)
    return
  }
  stream.state.errored = true
  process.nextTick(callback, error)
}

function createChunkDoc(filesId: ObjectId, n: number, data: Buffer): GridFSChunk {
  return {
    _id: new ObjectId(),
    files_id: filesId,
    n,
    data,
  }
}

async function checkChunksIndex(stream: GridFsBucketUpdateStream): Promise<void> {
  const index = {files_id: 1, n: 1}

  let indexes
  try {
    indexes = await stream.chunks.listIndexes().toArray()
  } catch (error) {
    if (
      error instanceof MongoError &&
      error.code === MONGODB_ERROR_CODES.NamespaceNotFound
    ) {
      indexes = []
    } else {
      throw error
    }
  }

  const hasChunksIndex = !!indexes.find((index) => {
    const keys = Object.keys(index.key)
    if (keys.length === 2 && index.key.files_id === 1 && index.key.n === 1) {
      return true
    }
    return false
  })

  if (!hasChunksIndex) {
    await stream.chunks.createIndex(index, {
      ...stream.writeConcern,
      background: true,
      unique: true,
    })
  }
}

function checkDone(stream: GridFsBucketUpdateStream, callback: Callback): void {
  if (stream.done) {
    return process.nextTick(callback)
  }

  if (
    stream.state.streamEnd &&
    stream.state.outstandingRequests === 0 &&
    !stream.state.errored
  ) {
    // Set done so we do not trigger duplicate createFilesDoc
    stream.done = true
    // Create a new files doc
    const gridFSFile = createFilesDoc(
      stream.id,
      stream.length,
      stream.chunkSizeBytes,
      stream.filename,
      stream.options.contentType,
      stream.options.aliases,
      stream.options.metadata
    )

    if (isAborted(stream, callback)) {
      return
    }

    const {_id, ...rest} = gridFSFile
    stream.files
      .findOneAndUpdate(
        {_id},
        {
          $set: {
            ...rest,
            length: stream.bytesWritten,
          },
        },
        {
          writeConcern: stream.writeConcern,
          upsert: true,
          returnDocument: 'after',
        }
      )
      .then(
        (doc) => {
          stream.gridFSFile = doc
          callback()
        },
        (error) => handleError(stream, error, callback)
      )
    return
  }

  process.nextTick(callback)
}

async function checkIndexes(stream: GridFsBucketUpdateStream): Promise<void> {
  const doc = await stream.files.findOne({}, {projection: {_id: 1}})
  if (doc != null) {
    // If at least one document exists assume the collection has the required index
    return
  }

  const index = {filename: 1, uploadDate: 1}

  let indexes
  try {
    indexes = await stream.files.listIndexes().toArray()
  } catch (error) {
    if (
      error instanceof MongoError &&
      error.code === MONGODB_ERROR_CODES.NamespaceNotFound
    ) {
      indexes = []
    } else {
      throw error
    }
  }

  const hasFileIndex = !!indexes.find((index) => {
    const keys = Object.keys(index.key)
    if (keys.length === 2 && index.key.filename === 1 && index.key.uploadDate === 1) {
      return true
    }
    return false
  })

  if (!hasFileIndex) {
    await stream.files.createIndex(index, {background: false})
  }

  await checkChunksIndex(stream)
}

function createFilesDoc(
  _id: ObjectId,
  length: number,
  chunkSize: number,
  filename: string,
  contentType?: string,
  aliases?: string[],
  metadata?: Document
): GridFSFile {
  const ret: GridFSFile = {
    _id,
    length,
    chunkSize,
    uploadDate: new Date(),
    filename,
  }

  if (contentType) {
    ret.contentType = contentType
  }

  if (aliases) {
    ret.aliases = aliases
  }

  if (metadata) {
    ret.metadata = metadata
  }

  return ret
}

function doWrite(
  stream: GridFsBucketUpdateStream,
  chunk: Buffer | string,
  encoding: BufferEncoding,
  callback: Callback<void>
): void {
  if (isAborted(stream, callback)) {
    return
  }

  const inputBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)

  stream.length += inputBuf.length

  // Input is small enough to fit in our buffer
  if (stream.pos + inputBuf.length < stream.chunkSizeBytes) {
    inputBuf.copy(stream.bufToStore, stream.pos)
    stream.pos += inputBuf.length
    process.nextTick(callback)
    return
  }
  // Otherwise, buffer is too big for current chunk, so we need to flush
  // to MongoDB.
  let inputBufRemaining = inputBuf.length
  let spaceRemaining: number = stream.chunkSizeBytes - stream.pos
  let numToCopy = Math.min(spaceRemaining, inputBuf.length)
  let outstandingRequests = 0
  while (inputBufRemaining > 0) {
    const inputBufPos = inputBuf.length - inputBufRemaining
    inputBuf.copy(stream.bufToStore, stream.pos, inputBufPos, inputBufPos + numToCopy)
    stream.pos += numToCopy
    spaceRemaining -= numToCopy
    let doc: GridFSChunk

    if (spaceRemaining === 0) {
      doc = createChunkDoc(stream.id, stream.n, Buffer.from(stream.bufToStore))

      ++stream.state.outstandingRequests
      ++outstandingRequests

      if (isAborted(stream, callback)) {
        return
      }

      stream.chunks.insertOne(doc, {writeConcern: stream.writeConcern}).then(
        () => {
          --stream.state.outstandingRequests
          --outstandingRequests
          stream.bytesWritten += doc.data.buffer.byteLength

          if (!outstandingRequests) {
            checkDone(stream, callback)
          }
        },
        (error) => handleError(stream, error, callback)
      )

      spaceRemaining = stream.chunkSizeBytes
      stream.pos = 0
      ++stream.n
    }
    inputBufRemaining -= numToCopy
    numToCopy = Math.min(spaceRemaining, inputBufRemaining)
  }
}

function writeRemnant(stream: GridFsBucketUpdateStream, callback: Callback): void {
  // Buffer is empty, so don't bother to insert
  if (stream.pos === 0) {
    return checkDone(stream, callback)
  }

  ++stream.state.outstandingRequests

  // Create a new buffer to make sure the buffer isn't bigger than it needs
  // to be.
  const remnant = Buffer.alloc(stream.pos)

  stream.bufToStore.copy(remnant, 0, 0, stream.pos)
  const doc = createChunkDoc(stream.id, stream.n, remnant)

  // If the stream was aborted, do not write remnant
  if (isAborted(stream, callback)) {
    return
  }

  stream.chunks.insertOne(doc, {writeConcern: stream.writeConcern}).then(
    () => {
      --stream.state.outstandingRequests
      stream.bytesWritten += doc.data.buffer.byteLength
      checkDone(stream, callback)
    },
    (error) => handleError(stream, error, callback)
  )
}

function isAborted(stream: GridFsBucketUpdateStream, callback: Callback<void>): boolean {
  if (stream.state.aborted) {
    process.nextTick(callback, new MongoAPIError('Stream has been aborted'))
    return true
  }
  return false
}

export async function countChunks(
  chunkCollection: Collection<GridFSChunk>,
  id: ObjectId
) {
  return chunkCollection.countDocuments({files_id: id})
}

export class GridFsBucketExtended extends GridFSBucket {
  readonly s: GridFSBucketPrivate

  constructor(db: Db, options?: GridFSBucketOptions) {
    super(db, options)
    this.setMaxListeners(0)
    const privateOptions = {
      ...DEFAULT_GRIDFS_BUCKET_OPTIONS,
      ...options,
      writeConcern: WriteConcern.fromOptions(options),
    }
    this.s = {
      db,
      options: privateOptions,
      _chunksCollection: db.collection<GridFSChunk>(
        privateOptions.bucketName + '.chunks'
      ),
      _filesCollection: db.collection<GridFSFile>(privateOptions.bucketName + '.files'),
      checkedIndexes: false,
      calledOpenUploadStream: false,
    }
  }
}

const DEFAULT_GRIDFS_BUCKET_OPTIONS: {
  bucketName: string
  chunkSizeBytes: number
} = {
  bucketName: 'fs',
  chunkSizeBytes: 255 * 1024,
}
