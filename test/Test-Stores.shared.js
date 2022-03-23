const assert = require('assert')
const sinon = require('sinon')

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
      assert(fileCreatedEvent.calledOnce)
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
