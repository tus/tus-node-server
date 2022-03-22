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

exports.shouldBehaveLikeAStore = function () {
  it('should be able to connect to the bucket', function () {
    assert.doesNotThrow(() => this.server.datastore._bucketExists())
  })

  it('should create a file and upload it', async function () {
    const fileCreatedEvent = sinon.fake()

    this.server.on(EVENTS.EVENT_FILE_CREATED, fileCreatedEvent)

    const file = await this.server.datastore.create({
      headers: {
        'upload-length': this.testFileSize.toString(),
        'upload-metadata': 'foo bar',
      },
    })
    assert.equal(file instanceof File, true)
    assert.equal(file.upload_length, this.testFileSize)
    assert(fileCreatedEvent.calledOnce)
  })
}
