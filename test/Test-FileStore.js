'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Server = require('../lib/Server')
const FileStore = require('../lib/stores/FileStore')

const shared = require('./Test-Stores.shared')

describe('FileStore', function () {
  beforeEach(function () {
    this.testFileSize = 960244
    this.storePath = '/test/output'
    this.testFilePath = path.resolve(__dirname, 'fixtures', 'test.mp4')
    this.filesDirectory = path.resolve(__dirname, `..${this.storePath}`)
    this.server = new Server()
    this.server.datastore = new FileStore({ path: this.storePath })
  })

  it('should create a directory for the files', function (done) {
    const stats = fs.lstatSync(this.filesDirectory)
    assert.equal(stats.isDirectory(), true)
    done()
  })

  it('should reject when the directory doesnt exist', function (done) {
    this.server.datastore.directory = 'some_new_path'
    assert.throws(() => this.server.datastore.create(req))
    done()
  })

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  shared.shouldRemoveUploads() // termination extension
  shared.shouldWriteUploads()

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
      const req = { headers: { 'upload-length': this.testFileSize } }

      file_store.create(req).then((file) => {
        file_store.getOffset(file.id).should.be.fulfilledWith(this.testFileSize)
      })
    })
  })
})
