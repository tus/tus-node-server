const assert = require('assert')
const sinon = require('sinon')

const File = require('../lib/models/File')
const { EVENTS } = require('../lib/constants')

// https://github.com/mochajs/mocha/wiki/Shared-Behaviours
// Note: don't use arrow functions for tests: https://mochajs.org/#arrow-functions

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
