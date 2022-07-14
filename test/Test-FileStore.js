'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const sinon = require('sinon')
const should = require('should')

const FileStore = require('../lib/stores/FileStore')
const MemoryConfigstore = require('../lib/configstores/MemoryConfigstore')
const File = require('../lib/models/File')
const { ERRORS, EVENTS } = require('../lib/constants')


const shared = require('./Test-Stores.shared')

describe.only('FileStore', function () {
  before(function () {
    this.testFileSize = 960244
    this.testFileName = 'test.mp4'
    this.storePath = '/test/output'
    this.testFilePath = path.resolve(__dirname, 'fixtures', this.testFileName)
    this.filesDirectory = path.resolve(__dirname, `..${this.storePath}`)
  })

  beforeEach(function () {
    sinon.spy(fs, "mkdir")

    this.datastore = new FileStore({
      directory: `${this.storePath.substring(1)}`,
      configstore: new MemoryConfigstore(),
    })
  })

  this.afterEach(function () {
    fs.mkdir.restore()
  })

  it('should create a directory for the files', function (done) {
    assert(fs.mkdir.calledOnce);
    assert.equal(this.datastore.directory, fs.mkdir.getCall(0).args[0]);
    done()
  })

  describe('create', function () {
    const file = new File('1234', '1000');

    it('should reject when the directory doesnt exist', function () {
      this.datastore.directory = 'some_new_path';
      return this.datastore.create(file).should.be.rejected()
    });

    it('should resolve when the directory exists', function () {
      return this.datastore.create(file).should.be.fulfilled();
    });

    it('should create an empty file', async function () {
      // TODO: this test would pass even if `datastore.create` would not create any file
      // as the file probably already exists from other tests
      await this.datastore.create(file);
      const stats = fs.statSync(path.join(this.datastore.directory, file.id));
      assert.equal(stats.size, 0);
    });
  });

  describe('write', function () {
    const file = new File('1234', `${this.testFileSize}`, undefined, 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');

    it('created file\'s size should match \'upload_length\'', async function () {
      await this.datastore.create(file);
      await this.datastore.write(fs.createReadStream(this.testFilePath), file.id, 0);

      const stats = fs.statSync(this.testFilePath);
      assert.equal(stats.size, this.testFileSize);
    });
  });

  describe('getOffset', function () {
    it('should reject directories', function () {
      return this.datastore.getOffset('').should.be.rejected();
    });
  });

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  shared.shouldRemoveUploads() // termination extension
  shared.shouldWriteUploads()
  shared.shouldHandleOffset()
})
