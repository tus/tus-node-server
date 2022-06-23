'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Server = require('../lib/Server')
const FileStore = require('../lib/stores/FileStore')

const shared = require('./Test-Stores.shared')

describe('FileStore', function () {
  before(function() {
    this.testFileSize = 960244
    this.testFileName = 'test.mp4'
    this.storePath = '/test/output'
    this.testFilePath = path.resolve(__dirname, 'fixtures', this.testFileName)
    this.filesDirectory = path.resolve(__dirname, `..${this.storePath}`)
  })

  beforeEach(function () {
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
  shared.shouldHandleOffset()
})
