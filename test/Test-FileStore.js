'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Server = require('../lib/Server')
const FileStore = require('../lib/stores/FileStore')
const EVENTS = require('../lib/constants').EVENTS

const TEST_FILE_PATH = path.resolve(__dirname, 'fixtures', 'test.mp4')
const TEST_FILE_SIZE = 960244

const shared = require('./Test-Stores.shared')

describe('FileStore', function () {
  beforeEach(function () {
    this.storePath = '/test/output'
    this.filesDirectory = path.resolve(__dirname, `..${this.storePath}`)
    this.server = new Server()
    this.server.datastore = new FileStore({ path: this.storePath })
  })

  shared.shouldHaveStoreMethods()

  it('should create a directory for the files', function (done) {
    const stats = fs.lstatSync(this.filesDirectory)
    assert.equal(stats.isDirectory(), true)
    done()
  })

  shared.shouldCreateUploads()

  it('should reject when the directory doesnt exist', function (done) {
    this.server.datastore.directory = 'some_new_path'
    assert.throws(() => this.server.datastore.create(req))
    done()
  })

  describe('remove', function () {
    it('should reject when the file does not exist', function () {
      const file_store = new FileStore({ path: this.storePath })
      const req = { file_id: '1234' }
      return file_store.remove(req).should.be.rejected()
    })

    it('should delete the file when it does exist', function () {
      const file_store = new FileStore({ path: this.storePath })
      const create_req = { headers: { 'upload-length': 1000 }, url: this.storePath }
      return file_store
        .create(create_req)
        .then((res) => {
          const rem_req = { file_id: res.id }
          return file_store.remove(rem_req)
        })
        .should.be.fulfilled()
    })

    it(`should fire the ${EVENTS.EVENT_FILE_DELETED} event`, function (done) {
      const file_store = new FileStore({ path: this.storePath })
      const create_req = { headers: { 'upload-length': 1000 }, url: this.storePath }
      file_store.on(EVENTS.EVENT_FILE_DELETED, (event) => {
        event.should.have.property('file_id')
        assert.equal(typeof event.file_id === 'string', true)
        done()
      })

      file_store.create(create_req).then((res) => {
        const rem_req = { file_id: res.id }
        return file_store.remove(rem_req)
      })
    })
  })

  describe('write', function () {
    it('should reject write streams that cant be opened', function () {
      const write_stream = fs.createReadStream(TEST_FILE_PATH)
      return this.server.datastore
        .write(write_stream, null, 0)
        .should.be.rejectedWith(500)
    })

    it('should reject write streams that cant be opened', function () {
      const write_stream = fs.createReadStream(TEST_FILE_PATH)
      return this.server.datastore.write(write_stream, '', 0).should.be.rejectedWith(500)
    })

    it('should open a stream and resolve the new offset', function (done) {
      const req = { headers: { 'upload-length': TEST_FILE_SIZE } }

      this.server.datastore
        .create(req)
        .then((file) => {
          const write_stream = fs.createReadStream(TEST_FILE_PATH)
          return this.server.datastore.write(write_stream, file.id, 0)
        })
        .then((offset) => {
          assert.equal(offset, TEST_FILE_SIZE)
          return done()
        })
        .catch(done)
    })

    it(`should fire the ${EVENTS.EVENT_UPLOAD_COMPLETE} event`, function (done) {
      const file_store = new FileStore({ path: this.storePath })
      file_store.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
        event.should.have.property('file')
        done()
      })

      const write_stream = fs.createReadStream(TEST_FILE_PATH)
      write_stream.once('open', () => {
        const req = { headers: { 'upload-length': TEST_FILE_SIZE }, url: this.storePath }
        file_store
          .create(req)
          .then((newFile) => {
            return file_store.write(write_stream, newFile.id, 0)
          })
          .catch(done)
      })
    })

    it('should settle on closed input stream', function (done) {
      const req = { headers: { 'upload-length': TEST_FILE_SIZE }, url: this.storePath }

      const write_stream = fs.createReadStream(TEST_FILE_PATH)

      write_stream.pause()
      write_stream.on('data', () => {
        write_stream.destroy()
      })

      const file_store = new FileStore({ path: this.storePath })
      file_store
        .create(req)
        .then((file) => {
          return file_store.write(write_stream, file.id, 0)
        })
        .catch(() => {})
        .finally(() => done())
    })
  })

  describe('getOffset', function () {
    it('should reject non-existant files', function () {
      const file_store = new FileStore({ path: this.storePath })
      return file_store.getOffset('doesnt_exist').should.be.rejectedWith(404)
    })

    it('should reject directories', function () {
      const file_store = new FileStore({ path: this.storePath })
      return file_store.getOffset('').should.be.rejectedWith(404)
    })

    it('should resolve the stats for existant files', function () {
      const file_store = new FileStore({ path: this.storePath })
      const req = { headers: { 'upload-length': TEST_FILE_SIZE } }

      file_store.create(req).then((file) => {
        file_store.getOffset(file.id).should.be.fulfilledWith(TEST_FILE_SIZE)
      })
    })
  })
})
