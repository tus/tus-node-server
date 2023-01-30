/* eslint-disable max-nested-callbacks */
import path from 'node:path'
import fs from 'node:fs'
import {strict as assert} from 'node:assert'

import rimraf from 'rimraf'
import request from 'supertest'
import {Storage} from '@google-cloud/storage'

import {Server, TUS_RESUMABLE, MemoryConfigstore, ERRORS} from '@tus/server'
import {FileStore} from '@tus/file-store'
import {GCSStore} from '@tus/gcs-store'

import type http from 'node:http'

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
        server.datastore.configstore.clear()
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

      it('should throw informative error on invalid metadata', (done) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Upload-Metadata', 'no sir')
          .expect(ERRORS.INVALID_METADATA.status_code)
          .end((_, res) => {
            assert.equal(res.text, ERRORS.INVALID_METADATA.body)
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
      it('unfinished upload response contains header Upload-Expires', (done) => {
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
          })

        const msg = 'tus test'
        const write_stream = agent
          .patch(`${STORE_PATH}/${file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', '0')
          .set('Content-Type', 'application/offset+octet-stream')
        write_stream.on('response', (res) => {
          assert.equal(res.statusCode, 204)
          assert.equal(res.header['tus-resumable'], TUS_RESUMABLE)
          assert.equal(res.header['upload-offset'], `${msg.length}`)
          assert.equal('upload-expires' in res.headers, true)
          done()
        })
        write_stream.write(msg)
        write_stream.end(() => {})
      })

      it('expired upload responds with 410 Gone', (done) => {
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

            setTimeout(() => {
              const msg = 'tus test'
              const write_stream = agent
                .patch(`${STORE_PATH}/${file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Offset', '0')
                .set('Content-Type', 'application/offset+octet-stream')
              write_stream.on('response', (res) => {
                assert.equal(res.statusCode, 410)
                done()
              })
              write_stream.write(msg)
              write_stream.end(() => {})
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

      it('can delete expired files', (done) => {
        server.datastore
          .deleteExpired()
          .catch((error) => {
            done(error)
          })
          .then((deleted) => {
            assert.equal(deleted >= 1, true)
            done()
          })
      })
    })
  })

  describe('GCSStore', () => {
    let file_id: string
    let deferred_file_id: string
    const files_created: string[] = []

    before(() => {
      server = new Server({
        path: STORE_PATH,
        datastore: new GCSStore({
          storageOptions: {
            projectId: PROJECT_ID,
            keyFilename: KEYFILE,
          },
          bucket: BUCKET,
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
})
