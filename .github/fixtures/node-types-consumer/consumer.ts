import type {IncomingMessage, ServerResponse} from 'node:http'
import {Readable} from 'node:stream'
import type {AzureStore} from '@tus/azure-store'
import {FileStore} from '@tus/file-store'
import type {GCSStore} from '@tus/gcs-store'
import type {S3Store} from '@tus/s3-store'
import {MemoryLocker, Server} from '@tus/server'
import {type CancellationContext, DataStore, StreamLimiter, Upload} from '@tus/utils'

export class ConsumerServer extends Server {
  protected override createContext() {
    const context = super.createContext()
    const signal: AbortSignal = context.signal
    const compatible: CancellationContext = context
    signal.addEventListener('abort', () => compatible.abort(), {once: true})
    return {signal, abort: context.abort, cancel: context.cancel}
  }

  context(): CancellationContext {
    return this.createContext()
  }
}

export function consumeStores(
  file: FileStore,
  azure: AzureStore,
  gcs: GCSStore,
  s3: S3Store,
  req: IncomingMessage,
  res: ServerResponse
) {
  const stores: DataStore[] = [file, azure, gcs, s3]
  const upload = new Upload({id: 'consumer', size: 4, offset: 0})
  const server = new ConsumerServer({
    path: '/files',
    datastore: file,
    onUploadCreate: async (request, created) => {
      const signal: AbortSignal = request.signal
      signal.throwIfAborted()
      return {metadata: created.metadata}
    },
  })
  const context: CancellationContext = server.context()
  const lock = new MemoryLocker().newLock(upload.id)
  const acquiring: Promise<void> = lock.lock(context.signal, context.cancel)
  const handling: Promise<void> = server.handle(req, res)
  const response: Promise<Response> = server.handleWeb(new Request('http://localhost/files'))
  const written: Promise<Response> = server.write(context, new Headers(), 200)
  const writing: Promise<number>[] = stores.map((store) =>
    store.write(Readable.from([Buffer.from('test')]), upload.id, 0)
  )
  const limited: Readable = Readable.from([Buffer.from('test')]).pipe(new StreamLimiter(4))
  return {acquiring, handling, response, written, writing, limited}
}
