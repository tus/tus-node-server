import assert from 'node:assert/strict'
import {once} from 'node:events'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {AzureStore} from '@tus/azure-store'
import {FileStore} from '@tus/file-store'
import {GCSStore} from '@tus/gcs-store'
import {S3Store} from '@tus/s3-store'
import {ERRORS, MemoryLocker, Server} from '@tus/server'
import {DataStore} from '@tus/utils'

class ConsumerServer extends Server {
  context() {
    return this.createContext()
  }
}

for (const Store of [AzureStore, FileStore, GCSStore, S3Store]) {
  assert.ok(Store.prototype instanceof DataStore)
}

const directory = await mkdtemp(join(tmpdir(), 'tus-node-types-'))
const store = new FileStore({directory})
const server = new ConsumerServer({path: '/files', datastore: store, lockDrainTimeout: 1})
const listener = server.listen(0, '127.0.0.1')

try {
  const immediate = server.context()
  immediate.abort()
  assert.equal(immediate.signal.aborted, true)
  assert.equal(immediate.signal.reason, ERRORS.ABORTED)

  const delayed = server.context()
  const aborted = once(delayed.signal, 'abort')
  delayed.cancel()
  assert.equal(delayed.signal.aborted, false)
  await aborted
  assert.equal(delayed.signal.aborted, true)

  const context = server.context()
  const lock = new MemoryLocker().newLock('consumer')
  await lock.lock(context.signal, context.cancel)
  await lock.unlock()

  if (!listener.listening) await once(listener, 'listening')
  const address = listener.address()
  assert.ok(address && typeof address === 'object')
  const endpoint = `http://127.0.0.1:${address.port}/files`
  const created = await fetch(endpoint, {
    method: 'POST',
    headers: {'Tus-Resumable': '1.0.0', 'Upload-Length': '4'},
  })
  assert.equal(created.status, 201)
  const location = created.headers.get('location')
  assert.ok(location)
  const uploadUrl = new URL(location, endpoint)
  const patched = await fetch(uploadUrl, {
    method: 'PATCH',
    headers: {
      'Tus-Resumable': '1.0.0',
      'Upload-Offset': '0',
      'Content-Type': 'application/offset+octet-stream',
    },
    body: Buffer.from('test'),
  })
  assert.equal(patched.status, 204)
  assert.equal(patched.headers.get('upload-offset'), '4')
  const head = await fetch(uploadUrl, {method: 'HEAD', headers: {'Tus-Resumable': '1.0.0'}})
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('upload-offset'), '4')
  const chunks = []
  for await (const chunk of store.read(uploadUrl.pathname.split('/').pop())) {
    chunks.push(chunk)
  }
  assert.equal(Buffer.concat(chunks).toString(), 'test')
  console.log(`Packaged Node types runtime checks passed on ${process.version}`)
} finally {
  await new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()))
    listener.closeAllConnections()
  })
  await rm(directory, {recursive: true, force: true})
}
