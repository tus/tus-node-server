const assert = require('assert')
const should = require('should');
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

    it('should report \'creation\' extension', function () {
      assert.equal(this.server.datastore.hasExtension('creation'), true);
    })

    it('should reject if both upload-length and upload-defer-length are not provided', async function () {
      return assert.rejects(() => this.server.datastore.create(invalidReq), { status_code: 412 })
    })

    it('should reject when namingFunction is invalid', async function () {
      const namingFunction = (incomingReq) => incomingReq.doesnotexist.replace(/\//g, '-')
      this.server.datastore.generateFileName = namingFunction
      return assert.rejects(() => this.server.datastore.create(req), { status_code: 500 })
    })

    it('should create a file with upload-length', async function () {
      const file = await this.server.datastore.create(req)

      assert.equal(file.upload_length, req.headers['upload-length']);
      assert.equal(file.upload_defer_length, undefined);

    })

    it('should create a file with upload-defer-length', async function () {
      const req = {
        headers: {
          'upload-defer-length': '1',
          'upload-metadata': 'foo bar',
        },
      };
      const file = await this.server.datastore.create(req);

      assert.equal(file.upload_defer_length, req.headers['upload-defer-length']);
      assert.equal(file.upload_length, undefined);
    })

    it('should create a file without upload-metadata', async function () {
      const req = {
        headers: {
          'upload-length': testFileSize.toString()
        },
      };
      const file = await this.server.datastore.create(req);

      assert.equal(file.upload_metadata, undefined);
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
    it('should report \'termination\' extension', function () {
      assert.equal(this.server.datastore.hasExtension('termination'), true);
    })

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
      return assert.rejects(this.server.datastore.remove({ file_id: file.id }))
    })
  })
}

exports.shouldWriteUploads = function () {
  describe('write', function () {
    it('should reject write streams that are not open yet', function () {
      const stream = fs.createReadStream(this.testFilePath)
      return this.server.datastore.write(stream, null, 0).should.be.rejectedWith(500)
    })

    it('should open a stream, resolve the new offset, and emit upload complete', function (done) {
      const uploadCompleteEvent = sinon.fake()
      const req = {
        headers: {
          'upload-length': this.testFileSize.toString(),
          'upload-metadata': 'foo bar',
        },
        url: this.storePath,
      }

      this.server.datastore.on(EVENTS.EVENT_UPLOAD_COMPLETE, uploadCompleteEvent)

      const stream = fs.createReadStream(this.testFilePath)
      const size = this.testFileSize
      let id

      stream.once('open', () => {
        this.server.datastore
          .create(req)
          .then((file) => {
            id = file.id
            return this.server.datastore.write(stream, file.id, 0)
          })
          .then((offset) => {
            assert.equal(offset, size)
            assert.equal(uploadCompleteEvent.calledOnce, true)
            return this.server.datastore.getOffset(id)
          })
          .then((stats) => {
            assert.equal(stats.upload_length, size)
          })
          .then(done)
          .catch(done)
      })
    })
  })
}

exports.shouldHandleOffset = function () {
  describe('getOffset', function () {
    it('should reject non-existant files', function () {
      return assert.rejects(() => this.server.datastore.getOffset('doesnt_exist'), { status_code: 404 })
    })

    it('should reject directories', function () {
      return assert.rejects(() => this.server.datastore.getOffset(''), { status_code: 404 })
    })

    it('should resolve the stats for existing files', function (done) {
      const req = {
        headers: {
          'upload-length': this.testFileSize.toString(),
          'upload-metadata': 'foo bar',
        },
        url: this.storePath,
      }

      this.server.datastore
        .create(req)
        .then((file) => this.server.datastore.getOffset(file.id))
        .then((stats) => {
          // TODO: make sure all stores return a number and not a string
          assert.strictEqual(Number(stats.upload_length), this.testFileSize)
        })
        .then(done)
        .catch(done)
    })
  })
}
