const assert = require('assert')
const sinon = require('sinon')
const fs = require('fs')

const File = require('../lib/models/File')
const { EVENTS } = require('../lib/constants')
const DataStore = require('../lib/stores/DataStore')

// https://github.com/mochajs/mocha/wiki/Shared-Behaviours
// Note: don't use arrow functions for tests: https://mochajs.org/#arrow-functions

exports.shouldHaveStoreMethods = function () {
  describe('the class', function () {
    it('must inherit from Datastore', function (done) {
      assert.equal(this.server.datastore instanceof DataStore, true)
      done()
    })

    it('must have a create method', function (done) {
      this.server.datastore.should.have.property('create')
      done()
    })

    it('must have a remove method', function (done) {
      this.server.datastore.should.have.property('remove')
      done()
    })

    it('must have a write method', function (done) {
      this.server.datastore.should.have.property('write')
      done()
    })

    it('must have a getOffset method', function (done) {
      this.server.datastore.should.have.property('getOffset')
      done()
    })
  })
}

exports.shouldCreateUploads = function () {
  describe('create', function () {
    const testFileSize = 960244
    const invalidReq = { headers: {}, url: this.storePath }
    const req = {
      headers: {
        'upload-length': testFileSize.toString(),
        'upload-metadata': 'foo bar',
      },
      url: this.storePath,
    }

    it('should reject if both upload-length and upload-defer-length are not provided', function (done) {
      assert.rejects(() => this.server.datastore.create(invalidReq))
      done()
    })

    it('should reject when namingFunction is invalid', function (done) {
      const namingFunction = (incomingReq) => incomingReq.doesnotexist.replace(/\//g, '-')
      this.server.datastore.generateFileName = namingFunction
      assert.rejects(() => this.server.datastore.create(req))
      done()
    })

    it('should create a file, process it, and send file created event', async function () {
      const fileCreatedEvent = sinon.fake()

      this.server.on(EVENTS.EVENT_FILE_CREATED, fileCreatedEvent)

      const file = await this.server.datastore.create(req)
      assert.equal(file instanceof File, true)
      assert.equal(file.upload_length, testFileSize)
      assert.equal(fileCreatedEvent.calledOnce, true)
    })

    it('should use custom naming function when provided', async function () {
      const namingFunction = () => 'hardcoded-name'

      this.server.datastore.generateFileName = namingFunction

      const file = await this.server.datastore.create(req)
      assert.equal(file instanceof File, true)
      assert.equal(file.id, 'hardcoded-name')
      assert.equal(file.upload_length, testFileSize)
    })
  })
}

exports.shouldRemoveUploads = function () {
  describe('remove (termination extension)', function () {
    it('should reject when the file does not exist', function () {
      const req = { file_id: '1234' }
      return this.server.datastore.remove(req).should.be.rejected()
    })

    it('should delete the file when it does exist', async function () {
      const fileDeletedEvent = sinon.fake()
      const req = { headers: { 'upload-length': 1000 }, url: this.storePath }

      this.server.datastore.on(EVENTS.EVENT_FILE_DELETED, fileDeletedEvent)

      const file = await this.server.datastore.create(req)
      await this.server.datastore.remove({ file_id: file.id })
      assert.equal(fileDeletedEvent.calledOnce, true)
    })
  })
}

exports.shouldWriteUploads = function () {
  describe('write', function () {
    it('should reject write streams that cant be opened', function () {
      const stream = fs.createReadStream(this.testFilePath)
      return this.server.datastore.write(stream, null, 0).should.be.rejectedWith(500)
    })

    xit('should open a stream, resolve the new offset, and emit upload complete', function (done) {
      const uploadCompleteEvent = sinon.fake()

      this.server.datastore.on(EVENTS.EVENT_UPLOAD_COMPLETE, uploadCompleteEvent)

      const stream = fs.createReadStream(this.testFilePath)
      const name = this.testFileName
      const size = this.testFileSize

      stream.once('open', () => {
        this.server.datastore
          .write(stream, name, 0)
          .then((offset) => {
            assert.equal(offset, size)
            assert.equal(uploadCompleteEvent.calledOnce, true)
            return done()
          })
          .catch(done)
      })
    })

    xit('should settle on closed input stream', function (done) {
      const req = {
        headers: {
          'upload-length': this.testFileSize.toString(),
          'upload-metadata': 'foo bar',
        },
        url: this.storePath,
      }

      const stream = fs.createReadStream(this.testFilePath)

      stream.pause()
      stream.on('data', () => stream.destroy())

      this.server.datastore
        .create(req)
        .then((file) => {
          return this.server.datastore.write(stream, file.id, 0)
        })
        .catch(() => {})
        .finally(() => done())
    })
  })
}

exports.shouldHandleOffset = function () {
  describe('getOffset', function () {
    it('should reject non-existant files', function () {
      return this.server.datastore.getOffset('doesnt_exist').should.be.rejectedWith(404)
    })

    it('should reject directories', function () {
      return this.server.datastore.getOffset('').should.be.rejectedWith(404)
    })

    it('should resolve the stats for existant files', function () {
      const req = { headers: { 'upload-length': this.testFileSize } }

      this.server.datastore.create(req).then((file) => {
        this.server.datastore.getOffset(file.id).should.be.fulfilledWith(this.testFileSize)
      })
    })
  })
}
