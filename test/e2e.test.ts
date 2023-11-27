/* eslint-disable max-nested-callbacks */
import path from 'node:path'
import fs from 'node:fs'
import {strict as assert} from 'node:assert'

import rimraf from 'rimraf'
import request from 'supertest'
import {Storage} from '@google-cloud/storage'

import {MemoryLocker, Server, TUS_RESUMABLE} from '@tus/server'
import {Configstore, MemoryConfigstore} from '@tus/file-store'
import {FileStore} from '@tus/file-store'
import {GCSStore} from '@tus/gcs-store'

import http from 'node:http'
import sinon from 'sinon'
import Throttle from 'throttle'
import {Agent} from 'http'

const STORE_PATH = '/output'
const PROJECT_ID = 'tus-node-server'
const KEYFILE = '../keyfile.json'
const BUCKET = 'tus-node-server-ci'
const FILES_DIRECTORY = path.resolve(STORE_PATH)
const TEST_FILE_SIZE = '960244'
const TEST_FILE_PATH = path.resolve('fixtures', 'test.mp4')
const TEST_METADATA = 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential'
const gcs = new Storage({
  projectId: PROJECT_ID,
  keyFilename: KEYFILE,
})

const bucket = gcs.bucket(BUCKET)
const deleteFile = (file_name: string) => {
  return new Promise((resolve, reject) => {
    console.log(`[GCLOUD] Deleting ${file_name} from ${bucket.name} bucket`)
    bucket.file(file_name).delete((err, res) => {
      if (err) reject(err)
      else resolve(res)
    })
  })
}

describe('EndToEnd', () => {
  let server: InstanceType<typeof Server>
  let listener: http.Server
  let agent: request.SuperAgentTest
  let file_to_delete: string

  describe('FileStore', () => {
    let file_id: string
    let deferred_file_id: string

    before(() => {
      server = new Server({
        path: STORE_PATH,
        datastore: new FileStore({directory: `./${STORE_PATH}`}),
      })
      listener = server.listen()
      agent = request.agent(listener)
    })

    after((done) => {
      // Remove the files directory
      rimraf(FILES_DIRECTORY, (err) => {
        if (err) {
          return done(err)
        }

        // Clear the config
        // @ts-expect-error we can consider a generic to pass to
        // datastore to narrow down the store type
        const uploads = (server.datastore.configstore as Configstore).list?.() ?? []
        for (const upload in uploads) {
          // @ts-expect-error we can consider a generic to pass to
          // datastore to narrow down the store type
          await(server.datastore.configstore as Configstore).delete(upload)
        }
        listener.close()
        return done()
      })
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
      before((done) => {
        // Remove the file to delete for 410 Gone test
        rimraf(`${FILES_DIRECTORY}/${file_to_delete}`, () => {
          return done()
        })
      })

      // TODO: this is bad practise! tests should never depend one each other!
      // it('should return 410 Gone for the file that has been deleted', (done) => {
      //   agent
      //     .head(`${STORE_PATH}/${file_to_delete}`)
      //     .set('Tus-Resumable', TUS_RESUMABLE)
      //     .expect(410)
      //     .expect('Tus-Resumable', TUS_RESUMABLE)
      //     .end(done)
      // })

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

  describe('FileStore with relativeLocation', () => {
    before(() => {
      server = new Server({
        path: STORE_PATH,
        datastore: new FileStore({directory: `./${STORE_PATH}`}),
        // Configure the store to return relative path in Location Header
        relativeLocation: true,
      })
      listener = server.listen()
      agent = request.agent(listener)
    })

    after(() => {
      listener.close()
    })

    describe('POST', () => {
      it('should create a file and respond with its _relative_ location', (done) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', `${TEST_FILE_SIZE}`)
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)
          .end((_, res) => {
            assert.equal('location' in res.headers, true)
            assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
            // The location header is not absolute
            assert.equal(!res.headers.location.includes('//'), true)
            // And contains the store path
            assert.equal(res.headers.location.includes(STORE_PATH), true)
            done()
          })
      })
    })
  })

  describe('FileStore with defined expirationPeriodInMilliseconds option', () => {
    let file_id: string

    before(() => {
      server = new Server({
        path: STORE_PATH,
        datastore: new FileStore({
          directory: `./${STORE_PATH}`,
          expirationPeriodInMilliseconds: 50,
          configstore: new MemoryConfigstore(),
        }),
      })
      listener = server.listen()
      agent = request.agent(listener)
    })

    after(() => {
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
          .end((_, res) => {
            assert.equal('upload-expires' in res.headers, true)
            file_id = res.headers.location.split('/').pop()
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

  describe('GCSStore', () => {
    let file_id: string
    let deferred_file_id: string
    const files_created: string[] = []

    before(() => {
      const storage = new Storage({
        projectId: PROJECT_ID,
        keyFilename: KEYFILE,
      })

      server = new Server({
        path: STORE_PATH,
        datastore: new GCSStore({
          bucket: storage.bucket(BUCKET),
        }),
      })
      listener = server.listen()
      agent = request.agent(listener)
    })

    after((done) => {
      // Delete these files from the bucket for cleanup
      const deletions = files_created.map((file_name) => deleteFile(file_name))
      Promise.all(deletions)
        .then(() => {
          return done()
        })
        .catch(done)
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
      // It('should create a file that will be deleted', (done) => {
      //     agent.post(STORE_PATH)
      //     .set('Tus-Resumable', TUS_RESUMABLE)
      //     .set('Upload-Defer-Length', 1)
      //     .set('Tus-Resumable', TUS_RESUMABLE)
      //     .expect(201)
      //     .end((err, res) => {
      //         assert.equal('location' in res.headers, true);
      //         assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
      //         // Save the id for subsequent tests
      //         file_to_delete = res.headers.location.split('/').pop();
      //         files_created.push(file_to_delete.split('&upload_id')[0])
      //         done();
      //     });
      // });

      it('should create a file and respond with its location', (done) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)
          .end((_, res) => {
            assert.equal('location' in res.headers, true)
            assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
            // Save the id for subsequent tests
            file_id = res.headers.location.split('/').pop()
            files_created.push(file_id.split('&upload_id')[0])
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
            files_created.push(deferred_file_id.split('&upload_id')[0])
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
      before(() => {
        // Remove the file to delete for 410 Gone test
      })
      // It('should return 410 Gone for the file that has been deleted', (done) => {
      //     agent.head(`${STORE_PATH}/${file_to_delete}`)
      //     .set('Tus-Resumable', TUS_RESUMABLE)
      //     .expect(410)
      //     .expect('Tus-Resumable', TUS_RESUMABLE)
      //     .end(done);
      // });

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
          .set('Upload-Length', `${TEST_FILE_SIZE}`)
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
          .set('Upload-Length', `${TEST_FILE_SIZE}`)
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
          assert.equal(res.statusCode, 204)
          assert.equal(res.header['tus-resumable'], TUS_RESUMABLE)
          assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`)
          bucket
            .file(file_id)
            .getMetadata()
            .then((result) => {
              const metadata = result[0]
              assert.equal(metadata.size, `${TEST_FILE_SIZE}`)
              done()
            })
            .catch(done)
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
          const id = res.headers.location.split('/').pop()
          agent
            .head(`${STORE_PATH}/${id}`)
            .set('Tus-Resumable', TUS_RESUMABLE)
            .expect(200)
            .expect('Upload-Offset', `${TEST_FILE_SIZE}`)
            .expect('Upload-Length', `${TEST_FILE_SIZE}`)
            .expect('Tus-Resumable', TUS_RESUMABLE)
            .end(done)
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
  })

  describe('File Store with Locking', () => {
    before(() => {
      server = new Server({
        path: STORE_PATH,
        datastore: new FileStore({directory: `./${STORE_PATH}`}),
        locker: new MemoryLocker(),
      })
      listener = server.listen()
      agent = request.agent(listener)
    })

    after((done) => {
      // Remove the files directory
      rimraf(FILES_DIRECTORY, (err) => {
        if (err) {
          return done(err)
        }

        // Clear the config
        // @ts-expect-error we can consider a generic to pass to
        // datastore to narrow down the store type
        const uploads = (server.datastore.configstore as Configstore).list?.() ?? []
        for (const upload in uploads) {
          // @ts-expect-error we can consider a generic to pass to
          // datastore to narrow down the store type
          await(server.datastore.configstore as Configstore).delete(upload)
        }
        listener.close()
        return done()
      })
    })

    it('will allow another request to acquire the lock by cancelling the previous request', async () => {
      const res = await agent
        .post(STORE_PATH)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Length', TEST_FILE_SIZE)
        .set('Upload-Metadata', TEST_METADATA)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .expect(201)

      assert.equal('location' in res.headers, true)
      assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
      // Save the id for subsequent tests
      const file_id = res.headers.location.split('/').pop()
      const file_size = parseInt(TEST_FILE_SIZE, 10)

      // Slow down writing
      const originalWrite = server.datastore.write.bind(server.datastore)
      sinon.stub(server.datastore, 'write').callsFake((stream, ...args) => {
        const throttleStream = new Throttle({bps: file_size / 4})
        return originalWrite(stream.pipe(throttleStream), ...args)
      })

      const data = Buffer.alloc(parseInt(TEST_FILE_SIZE, 10), 'a')
      const httpAgent = new Agent({
        maxSockets: 2,
        maxFreeSockets: 10,
        timeout: 10000,
        keepAlive: true,
      })

      const createPatchReq = (offset: number) => {
        return agent
          .patch(`${STORE_PATH}/${file_id}`)
          .agent(httpAgent)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', offset.toString())
          .set('Content-Type', 'application/offset+octet-stream')
          .send(data.subarray(offset))
      }

      const req1 = createPatchReq(0).then((e) => e)
      await wait(100)

      const req2 = agent
        .head(`${STORE_PATH}/${file_id}`)
        .agent(httpAgent)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .expect(200)
        .then((e) => e)

      const [res1, res2] = await Promise.allSettled([req1, req2])
      assert.equal(res1.status, 'fulfilled')
      assert.equal(res2.status, 'fulfilled')
      assert.equal(res1.value.statusCode, 400)
      assert.equal(res1.value.headers['upload-offset'] !== TEST_FILE_SIZE, true)

      assert.equal(res2.value.statusCode, 200)

      // Verify that we are able to resume even if the first request
      // was cancelled by the second request trying to acquire the lock
      const offset = parseInt(res2.value.headers['upload-offset'], 10)

      const finishedUpload = await createPatchReq(offset)

      assert.equal(finishedUpload.statusCode, 204)
      assert.equal(finishedUpload.headers['upload-offset'], TEST_FILE_SIZE)
    }).timeout(20000)
  })
})

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
