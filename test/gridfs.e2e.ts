import path from 'node:path'
import fs from 'fs'
import {strict as assert} from 'node:assert'

import request from 'supertest'

import {GridFsStore} from '@tus/gridfs-store'
import {Server, TUS_RESUMABLE} from '@tus/server'

import type http from 'node:http'

import {MongoMemoryServer} from 'mongodb-memory-server'
const STORE_PATH = '/output'
const TEST_FILE_SIZE = '960244'
const TEST_FILE_PATH = path.resolve('fixtures', 'test.mp4')
const TEST_METADATA = 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential'

async function clearDatabase(store: GridFsStore) {
  for (const file of await store.configstore.list()) {
    await store.remove(file)
  }
}

describe('GridfsStore E2E', () => {
  describe('Gridfs Store with without expiration option', () => {
    let server: InstanceType<typeof Server>
    let listener: http.Server
    let agent: request.SuperAgentTest
    let GfsStore: GridFsStore
    let mongod: MongoMemoryServer
    let file_id: string
    let file_to_delete: string
    let deferred_file_id: string
    const files_created: string[] = []
    before(async () => {
      mongod = await MongoMemoryServer.create()

      GfsStore = new GridFsStore({
        bucketName: 'e2e_tests',
        dbName: 'E2E',
        mongoUri: await mongod.getUri(),
      })
      server = new Server({
        path: STORE_PATH,
        datastore: GfsStore,
      })

      listener = server.listen()
      agent = request.agent(listener)
    })

    after(async () => {
      // delete all files created from our store;
      const deletions = files_created.map((file) => GfsStore.remove(file))
      await Promise.all(deletions)

      //await GfsStore.clientConnection.close()
      await mongod.stop()
      listener.close()
    })
    describe('HEAD', () => {
      it('should 404 file ids that dont exist', (done) => {
        agent
          .head(`${STORE_PATH}/${file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(404)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })
    })

    describe('POST', () => {
      it('should create a file that will be deleted', (done) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Defer-Length', '1')
          .expect(201)
          .end((_, res) => {
            assert.equal('location' in res.headers, true)
            assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
            // Save the id for subsequent tests
            file_to_delete = res.headers.location.split('/').pop()
            files_created.push(file_to_delete)
            done()
          })
      })

      it('should create a file and respond with its location', (done) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Upload-Metadata', TEST_METADATA)
          .expect(201)
          .end((_, res) => {
            assert.equal('location' in res.headers, true)
            assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
            // Save the id for subsequent tests
            file_id = res.headers.location.split('/').pop()
            files_created.push()
            done()
          })
      })

      it('should create a file with a deferred length', (done) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Defer-Length', '1')
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)
          .end((_, res) => {
            assert.equal('location' in res.headers, true)
            assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
            // Save the id for subsequent tests
            deferred_file_id = res.headers.location.split('/').pop()
            files_created.push(deferred_file_id)
            done()
          })
      })

      it('should create a file and upload content', (done) => {
        const read_stream = fs.createReadStream(TEST_FILE_PATH)
        const write_stream = agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Content-Type', 'application/offset+octet-stream')
        write_stream.on('response', (res) => {
          assert.equal(res.statusCode, 201)
          assert.equal(res.header['tus-resumable'], TUS_RESUMABLE)
          assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`)
          done()
        })
        // Using .pipe() broke when upgrading to Superagent 3.0+,
        // so now we use data events to read the file to the agent.
        read_stream.on('data', (chunk) => {
          write_stream.write(chunk)
        })
        read_stream.on('end', () => {
          write_stream.end(() => {})
        })
      })
    })

    describe('HEAD', () => {
      it('should return a starting offset, metadata for the new file', (done) => {
        agent
          .head(`${STORE_PATH}/${file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(200)
          .expect('Upload-Metadata', TEST_METADATA)
          .expect('Upload-Offset', '0')
          .expect('Upload-Length', `${TEST_FILE_SIZE}`)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })

      it('should return the defer length of the new deferred file', (done) => {
        agent
          .head(`${STORE_PATH}/${deferred_file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(200)
          .expect('Upload-Offset', '0')
          .expect('Upload-Defer-Length', '1')
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })
    })

    describe('PATCH', () => {
      it('should 404 paths without a file id', (done) => {
        agent
          .patch(`${STORE_PATH}/`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', '0')
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Content-Type', 'application/offset+octet-stream')
          .expect(404)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })

      it('should 404 paths that do not exist', (done) => {
        agent
          .patch(`${STORE_PATH}/dont_exist`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', '0')
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Content-Type', 'application/offset+octet-stream')
          .expect(404)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })

      it('should upload the file', (done) => {
        const read_stream = fs.createReadStream(TEST_FILE_PATH)
        const write_stream = agent
          .patch(`${STORE_PATH}/${file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', '0')
          .set('Content-Type', 'application/offset+octet-stream')
        write_stream.on('response', (res) => {
          // TODO: this is not called when request fails
          assert.equal(res.statusCode, 204)
          assert.equal(res.header['tus-resumable'], TUS_RESUMABLE)
          assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`)
          done()
        })
        // Using .pipe() broke when upgrading to Superagent 3.0+,
        // so now we use data events to read the file to the agent.
        read_stream.on('data', (chunk) => {
          write_stream.write(chunk)
        })
        read_stream.on('end', () => {
          write_stream.end(() => {})
        })
      })
    })

    describe('HEAD', () => {
      it('should return the ending offset of the uploaded file', (done) => {
        agent
          .head(`${STORE_PATH}/${file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(200)
          .expect('Upload-Metadata', TEST_METADATA)
          .expect('Upload-Offset', `${TEST_FILE_SIZE}`)
          .expect('Upload-Length', `${TEST_FILE_SIZE}`)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })
    })
  })

  describe('GridfsStore with defined expirationPeriodInMilliseconds option', () => {
    let server: InstanceType<typeof Server>
    let listener: http.Server
    let agent: request.SuperAgentTest
    let GfsStore: GridFsStore
    let mongod: MongoMemoryServer
    let file_id: string

    before(async () => {
      mongod = await MongoMemoryServer.create()
      GfsStore = new GridFsStore({
        bucketName: 'e2e_tests_expiration',
        dbName: 'e2e',
        mongoUri: await mongod.getUri(),
        expirationPeriodinMs: 50,
      })
      server = new Server({
        path: STORE_PATH,
        datastore: GfsStore,
      })

      listener = server.listen()
      agent = request.agent(listener)
    })
    after(async () => {
      // clear the data
      await clearDatabase(GfsStore)
      await mongod.stop()
      listener.close()
    })
    describe('OPTIONS', () => {
      it('should respond with expiration in Tus-Extension header', (done) => {
        agent
          .options(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(204)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .expect('Tus-Extension', 'expiration')
          .end((_, res) => {
            res.headers['tus-extension'].includes('expiration')
            done()
          })
      })
    })

    describe('POST', () => {
      it('should respond with Upload-Expires', (done) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', `${TEST_FILE_SIZE}`)
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)
          .end(() => {
            done()
          })
      })
    })

    describe('PATCH', () => {
      it('unfinished upload response contains header Upload-Expires', async () => {
        const res = await agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', `${TEST_FILE_SIZE}`)
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)

        assert.equal('upload-expires' in res.headers, true)
        file_id = res.headers.location.split('/').pop()

        const msg = 'tus test'
        const patch_res = await agent
          .patch(`${STORE_PATH}/${file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', '0')
          .set('Content-Type', 'application/offset+octet-stream')
          .send(msg)
        assert.equal(patch_res.statusCode, 204)
        assert.equal(patch_res.header['tus-resumable'], TUS_RESUMABLE)
        assert.equal(patch_res.header['upload-offset'], `${msg.length}`)
        assert.equal('upload-expires' in patch_res.headers, true)
      })

      it('expired upload responds with 410 Gone', async () => {
        const res = await agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', `${TEST_FILE_SIZE}`)
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)

        assert.equal('upload-expires' in res.headers, true)
        file_id = res.headers.location.split('/').pop()

        await new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            const msg = 'tus test'
            agent
              .patch(`${STORE_PATH}/${file_id}`)
              .set('Tus-Resumable', TUS_RESUMABLE)
              .set('Upload-Offset', '0')
              .set('Content-Type', 'application/offset+octet-stream')
              .send(msg)
              .expect(410)
              .then(() => resolve())
              .catch(reject)
          }, 51)
        })
      })
    })

    describe('deleteExpiredFiles', () => {
      it('HEAD request to expired upload returns 410 Gone', (done) => {
        agent
          .head(`${STORE_PATH}/${file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(410)
          .end(done)
      })

      it('can delete expired files', async () => {
        const deleted = await server.datastore.deleteExpired()

        assert.equal(deleted >= 1, true)
      })
    })
  })
})
