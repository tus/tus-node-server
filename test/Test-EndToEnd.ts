import path from 'node:path'
import fs from 'node:fs'
import {strict as assert} from 'node:assert'

import rimraf from 'rimraf'
import request from 'supertest'
import {Storage} from '@google-cloud/storage'

import Server from '../lib/Server'
import FileStore from '../lib/stores/FileStore'
import GCSDataStore from '../lib/stores/GCSDataStore'
import {TUS_RESUMABLE} from '../lib/constants'

const STORE_PATH = '/test/output'
const PROJECT_ID = 'tus-node-server'

const KEYFILE = path.resolve(__dirname, '../keyfile.json')
const BUCKET = 'tus-node-server-ci'
const FILES_DIRECTORY = path.resolve(__dirname, `..${STORE_PATH}`)
const TEST_FILE_SIZE = 960_244
const TEST_FILE_PATH = path.resolve(__dirname, 'fixtures', 'test.mp4')
const TEST_METADATA = 'some data, for you'
const gcs = new Storage({
  projectId: PROJECT_ID,
  keyFilename: KEYFILE,
})

const bucket = gcs.bucket(BUCKET)
const deleteFile = (file_name: any) => {
  return new Promise((resolve, reject) => {
    console.log(`[GCLOUD] Deleting ${file_name} from ${bucket.name} bucket`)
    bucket.file(file_name).delete((err, res) => {
      resolve(res)
    })
  })
}

describe('EndToEnd', () => {
  let server: any
  let listener: any
  let agent: any
  let file_to_delete: any

  describe('FileStore', () => {
    let file_id: any
    let deferred_file_id: any

    before(() => {
      server = new Server({
        path: STORE_PATH,
      })
      server.datastore = new FileStore({
        directory: `./${STORE_PATH}`,
      })
      listener = server.listen()
      agent = request.agent(listener)
    })

    after((done: any) => {
      // Remove the files directory
      rimraf(FILES_DIRECTORY, (err: any) => {
        if (err) {
          return done(err)
        }

        // Clear the config
        server.datastore.configstore.clear()
        listener.close()
        return done()
      })
    })

    describe('HEAD', () => {
      it('should 404 file ids that dont exist', (done: any) => {
        agent
          .head(`${STORE_PATH}/${file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(404)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })
    })

    describe('POST', () => {
      it('should create a file that will be deleted', (done: any) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Defer-Length', 1)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)
          .end((err: any, res: any) => {
            assert.equal('location' in res.headers, true)
            assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
            // Save the id for subsequent tests
            file_to_delete = res.headers.location.split('/').pop()
            done()
          })
      })

      it('should create a file and respond with its location', (done: any) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)
          .end((err: any, res: any) => {
            assert.equal('location' in res.headers, true)
            assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
            // Save the id for subsequent tests
            file_id = res.headers.location.split('/').pop()
            done()
          })
      })

      it('should create a file with a deferred length', (done: any) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Defer-Length', 1)
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)
          .end((err: any, res: any) => {
            assert.equal('location' in res.headers, true)
            assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
            // Save the id for subsequent tests
            deferred_file_id = res.headers.location.split('/').pop()
            done()
          })
      })

      it('should create a file and upload content', (done: any) => {
        const read_stream = fs.createReadStream(TEST_FILE_PATH)
        const write_stream = agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Content-Type', 'application/offset+octet-stream')
        write_stream.on('response', (res: any) => {
          assert.equal(res.statusCode, 201)
          assert.equal(res.header['tus-resumable'], TUS_RESUMABLE)
          assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`)
          done()
        })
        // Using .pipe() broke when upgrading to Superagent 3.0+,
        // so now we use data events to read the file to the agent.
        read_stream.on('data', (chunk: any) => {
          write_stream.write(chunk)
        })
        read_stream.on('end', () => {
          write_stream.end(() => {})
        })
      })
    })

    describe('HEAD', () => {
      before((done: any) => {
        // Remove the file to delete for 410 Gone test
        rimraf(`${FILES_DIRECTORY}/${file_to_delete}`, () => {
          return done()
        })
      })

      it('should return 410 Gone for the file that has been deleted', (done: any) => {
        agent
          .head(`${STORE_PATH}/${file_to_delete}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(410)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })

      it('should return a starting offset, metadata for the new file', (done: any) => {
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

      it('should return the defer length of the new deferred file', (done: any) => {
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
      it('should 404 paths without a file id', (done: any) => {
        agent
          .patch(`${STORE_PATH}/`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', 0)
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Content-Type', 'application/offset+octet-stream')
          .expect(404)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })

      it('should 404 paths that do not exist', (done: any) => {
        agent
          .patch(`${STORE_PATH}/dont_exist`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', 0)
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Content-Type', 'application/offset+octet-stream')
          .expect(404)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })

      it('should upload the file', (done: any) => {
        const read_stream = fs.createReadStream(TEST_FILE_PATH)
        const write_stream = agent
          .patch(`${STORE_PATH}/${file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', 0)
          .set('Content-Type', 'application/offset+octet-stream')
        write_stream.on('response', (res: any) => {
          // TODO: this is not called when request fails
          assert.equal(res.statusCode, 204)
          assert.equal(res.header['tus-resumable'], TUS_RESUMABLE)
          assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`)
          done()
        })
        // Using .pipe() broke when upgrading to Superagent 3.0+,
        // so now we use data events to read the file to the agent.
        read_stream.on('data', (chunk: any) => {
          write_stream.write(chunk)
        })
        read_stream.on('end', () => {
          write_stream.end(() => {})
        })
      })
    })

    describe('HEAD', () => {
      it('should return the ending offset of the uploaded file', (done: any) => {
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
        // Configure the store to return relative path in Location Header
        relativeLocation: true,
      })
      server.datastore = new FileStore({
        directory: `./${STORE_PATH}`,
      })
      listener = server.listen()
      agent = request.agent(listener)
    })

    after(() => {
      listener.close()
    })

    describe('POST', () => {
      it('should create a file and respond with its _relative_ location', (done: any) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', `${TEST_FILE_SIZE}`)
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)
          .end((err: any, res: any) => {
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

  describe('GCSDataStore', () => {
    let file_id: any
    let deferred_file_id: any
    const files_created: any = []

    before(() => {
      server = new Server({
        path: STORE_PATH,
      })
      server.datastore = new GCSDataStore({
        projectId: PROJECT_ID,
        keyFilename: KEYFILE,
        bucket: BUCKET,
      })
      listener = server.listen()
      agent = request.agent(listener)
    })

    after((done: any) => {
      // Delete these files from the bucket for cleanup
      // @ts-expect-error TS(7006): Parameter 'file_name' implicitly has an 'any' type... Remove this comment to see the full error message
      const deletions = files_created.map((file_name) => deleteFile(file_name))
      Promise.all(deletions)
        .then(() => {
          return done()
        })
        .catch(done)
      listener.close()
    })

    describe('HEAD', () => {
      it('should 404 file ids that dont exist', (done: any) => {
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

      it('should create a file and respond with its location', (done: any) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)
          .end((err: any, res: any) => {
            assert.equal('location' in res.headers, true)
            assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
            // Save the id for subsequent tests
            file_id = res.headers.location.split('/').pop()
            files_created.push(file_id.split('&upload_id')[0])
            done()
          })
      })

      it('should create a file with a deferred length', (done: any) => {
        agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Defer-Length', 1)
          .set('Upload-Metadata', TEST_METADATA)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .expect(201)
          .end((err: any, res: any) => {
            assert.equal('location' in res.headers, true)
            assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE)
            // Save the id for subsequent tests
            deferred_file_id = res.headers.location.split('/').pop()
            files_created.push(deferred_file_id.split('&upload_id')[0])
            done()
          })
      })

      it('should create a file and upload content', (done: any) => {
        const read_stream = fs.createReadStream(TEST_FILE_PATH)
        const write_stream = agent
          .post(STORE_PATH)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Length', TEST_FILE_SIZE)
          .set('Content-Type', 'application/offset+octet-stream')
        write_stream.on('response', (res: any) => {
          assert.equal(res.statusCode, 201)
          assert.equal(res.header['tus-resumable'], TUS_RESUMABLE)
          assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`)
          done()
        })
        // Using .pipe() broke when upgrading to Superagent 3.0+,
        // so now we use data events to read the file to the agent.
        read_stream.on('data', (chunk: any) => {
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

      it('should return a starting offset, metadata for the new file', (done: any) => {
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

      it('should return the defer length of the new deferred file', (done: any) => {
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
      it('should 404 paths without a file id', (done: any) => {
        agent
          .patch(`${STORE_PATH}/`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', 0)
          .set('Upload-Length', `${TEST_FILE_SIZE}`)
          .set('Content-Type', 'application/offset+octet-stream')
          .expect(404)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })

      it('should 404 paths that do not exist', (done: any) => {
        agent
          .patch(`${STORE_PATH}/dont_exist`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', 0)
          .set('Upload-Length', `${TEST_FILE_SIZE}`)
          .set('Content-Type', 'application/offset+octet-stream')
          .expect(404)
          .expect('Tus-Resumable', TUS_RESUMABLE)
          .end(done)
      })

      it('should upload the file', (done: any) => {
        const read_stream = fs.createReadStream(TEST_FILE_PATH)
        const write_stream = agent
          .patch(`${STORE_PATH}/${file_id}`)
          .set('Tus-Resumable', TUS_RESUMABLE)
          .set('Upload-Offset', 0)
          .set('Content-Type', 'application/offset+octet-stream')
        write_stream.on('response', (res: any) => {
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
        read_stream.on('data', (chunk: any) => {
          write_stream.write(chunk)
        })
        read_stream.on('end', () => {
          write_stream.end(() => {})
        })
      })
    })

    describe('HEAD', () => {
      it('should return the ending offset of the uploaded file', (done: any) => {
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
})