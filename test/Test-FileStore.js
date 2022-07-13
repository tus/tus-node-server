'use strict'
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const sinon = require('sinon')
const should = require('should')

const Server = require('../lib/Server')
const FileStore = require('../lib/stores/FileStore')
const File = require('../lib/models/File')
const { ERRORS, EVENTS } = require('../lib/constants')


const shared = require('./Test-Stores.shared')

describe('FileStore', function () {
  before(function () {
    this.testFileSize = 960244
    this.testFileName = 'test.mp4'
    this.storePath = '/test/output'
    this.testFilePath = path.resolve(__dirname, 'fixtures', this.testFileName)
    this.filesDirectory = path.resolve(__dirname, `..${this.storePath}`)
  })

  beforeEach(function () {
    sinon.spy(fs, "mkdir")

    this.server = new Server()
    this.server.datastore = new FileStore({ path: this.storePath })
  })

  this.afterEach(function () {
    fs.mkdir.restore()
  })

  it('should create a directory for the files', function (done) {
    assert(fs.mkdir.calledOnce);
    assert.equal(this.storePath.endsWith(fs.mkdir.getCall(0).args[0]), true);
    done()
  })

  describe('create', function () {
    const file = new File('1234', 1000);

    it('should reject when the directory doesnt exist', function () {
      const file_store = new FileStore({ path: this.storePath });
      file_store.directory = 'some_new_path';
      return file_store.create(file).should.be.rejected()
    });

    it('should resolve when the directory exists', function () {
        const file_store = new FileStore({ path: this.storePath });
        return file_store.create(file).should.be.fulfilled();
    });

    it('should resolve to the File model', function (done) {
      const file_store = new FileStore({ path: this.storePath });
      file_store.create(file)
        .then((newFile) => {
          assert.equal(newFile instanceof File, true);
          return done();
        })
        .catch(done);
    });

    it(`should fire the ${EVENTS.EVENT_FILE_CREATED} event`, function (done) {
      const file_store = new FileStore({ path: this.storePath });
      file_store.on(EVENTS.EVENT_FILE_CREATED, (event) => {
        event.should.have.property('file');
        assert.equal(event.file instanceof File, true);
        done();
      });
      file_store.create(file);
    });
  });

  describe('write', function () {
    it('should reject write streams that cant be opened', function () {
      const write_stream = fs.createReadStream(this.testFilePath);
      return this.server.datastore.write(write_stream, null, 0)
          .should.be.rejectedWith(ERRORS.FILE_WRITE_ERROR);
    });

    it('should reject write streams that cant be opened', function () {
      const write_stream = fs.createReadStream(this.testFilePath);
      return this.server.datastore.write(write_stream, '.', 0)
          .should.be.rejectedWith(ERRORS.FILE_WRITE_ERROR);
    });

    it('should open a stream and resolve the new offset', function (done) {
      const file_store = new FileStore({ path: this.storePath });
      // const file_store = new FileStore({ path: this.storePath, directory: this.filesDirectory });
      const readable = fs.createReadStream(this.testFilePath);
      file_store.write(readable, this.testFileName, 0)
      .then((offset) => {
        assert.equal(offset, this.testFileSize);
        return done();
      })
      .catch(done);
    });

    it(`should fire the ${EVENTS.EVENT_UPLOAD_COMPLETE} event`, (done) => {
      const file_store = new FileStore({ path: this.storePath });
      file_store.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
        event.should.have.property('file');
        done();
      });

      const readable = fs.createReadStream(this.testFilePath);
      readable.once('open', () => {
        const req = { headers: { 'upload-length': this.testFileSize }, url: this.storePath }
        file_store.create(new File('1234', this.testFileSize))
        .then((newFile) => {
          return file_store.write(readable, newFile.id, 0);
        }).catch(done);
      });
    });
  });

  describe('getOffset', () => {
    it('should reject non-existant files', () => {
      const file_store = new FileStore({ path: this.storePath });
      return file_store.getOffset('doesnt_exist').should.be.rejectedWith(404);
    });

    it('should reject directories', () => {
      const file_store = new FileStore({ path: this.storePath });
      return file_store.getOffset('')
          .should.be.rejectedWith(404);
    });

    it('should resolve the stats for existant files', () => {
      const file_store = new FileStore({ path: this.storePath });
      return file_store.getOffset(TEST_FILE_NAME)
          .should.be.fulfilledWith(fs.statSync(`${FILES_DIRECTORY}/${TEST_FILE_NAME}`));
    });
  });

  shared.shouldHaveStoreMethods()
  shared.shouldCreateUploads()
  shared.shouldRemoveUploads() // termination extension
  shared.shouldWriteUploads()
  shared.shouldHandleOffset()
})
