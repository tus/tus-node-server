const assert = require('assert')
const fs = require('fs')
const stream = require('stream')

const should = require('should')

const File = require('../lib/models/File')

// https://github.com/mochajs/mocha/wiki/Shared-Behaviours
// Note: don't use arrow functions for tests: https://mochajs.org/#arrow-functions

exports.shouldHaveStoreMethods = function () {
  describe('the class', function () {
    it('must have a write method', function (done) {
      this.datastore.should.have.property('write')
      done()
    })

    it('must have a getOffset method', function (done) {
      this.datastore.should.have.property('getOffset')
      done()
    })
  })
}

exports.shouldCreateUploads = function () {
  describe('create', function () {
    const file = new File('1234', '1000', undefined, 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');
    const file_defered = new File('1234', undefined, '1');

    it('should resolve to file', async function () {
      const newFile = await this.datastore.create(file);
      assert.equal(newFile instanceof File, true);
    });

    it('should report \'creation\' extension', function () {
      assert.equal(this.datastore.hasExtension('creation'), true);
    })

    it('should create new upload resource', async function () {
      await this.datastore.create(file);
      const data = await this.datastore.getOffset(file.id);
      assert.equal(data.size, 0);
    });

    it('should store `upload_length` when creating new resource', async function () {
      await this.datastore.create(file);
      const data = await this.datastore.getOffset(file.id);
      assert.equal(data.upload_length, file.upload_length);
    });

    it('should store `upload_defer_length` when creating new resource', async function () {
      await this.datastore.create(file_defered);
      const data = await this.datastore.getOffset(file.id);
      assert.equal(data.upload_defer_length, file_defered.upload_defer_length);
    });

    it('should store `upload_metadata` when creating new resource', async function () {
      await this.datastore.create(file);
      const data = await this.datastore.getOffset(file.id);
      assert.equal(data.upload_metadata, file.upload_metadata);
    });
  })
}

exports.shouldRemoveUploads = function () {
  const file = new File('1234', '1000');

  describe('remove (termination extension)', function () {
    it('should report \'termination\' extension', function () {
      assert.equal(this.datastore.hasExtension('termination'), true);
    })

    it('should reject when the file does not exist', function () {
      return this.datastore.remove('doesnt_exist').should.be.rejected()
    })

    it('should delete the file when it does exist', async function () {
      await this.datastore.create(file)
      return this.datastore.remove(file.id)
    })
  })
}

exports.shouldWriteUploads = function () {
  describe('write', function () {
    const file = new File('1234', `${this.testFileSize}`, undefined, 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');

    it('should reject write streams that can not be open', async function () {
      const stream = fs.createReadStream(this.testFilePath)
      return this.datastore.write(stream, 'doesnt_exist', 0).should.be.rejected()
    })

    it('should reject whean readable stream has an error', async function () {
      const stream = fs.createReadStream(this.testFilePath)
      return this.datastore.write(stream, 'doesnt_exist', 0).should.be.rejected()
    })

    it('should write a stream and resolve the new offset', async function () {
      await this.datastore.create(file);

      const readable = fs.createReadStream(this.testFilePath);
      const offset = await this.datastore.write(readable, file.id, 0);
      assert.equal(offset, this.testFileSize);
    });

    it('should reject when stream is destroyed', async function () {
      await this.datastore.create(file);

      const readable = new stream.Readable();
      const offset = this.datastore.write(readable, file.id, 0);

      readable.push('some data');
      readable.destroy();

      return offset.should.be.rejected();
    });
  })
}

exports.shouldHandleOffset = function () {
  describe('getOffset', function () {
    const file = new File('1234', `${this.testFileSize}`, undefined, 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');

    it('should reject non-existant files', function () {
      return this.datastore.getOffset('doesnt_exist').should.be.rejected()
    })

    it('should resolve the stats for existing files', async function () {
      await this.datastore.create(file);
      const offset = await this.datastore.write(fs.createReadStream(this.testFilePath), file.id, 0);
      const data = await this.datastore.getOffset(file.id)

      assert.equal(data.size, offset);
    })
  })
}
