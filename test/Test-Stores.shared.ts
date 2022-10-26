import 'should'
import {strict as assert} from 'node:assert'
import fs from 'node:fs'
import stream from 'node:stream'

import File from '../lib/models/File'

export const shouldHaveStoreMethods = function () {
  describe('the class', () => {
    it('must have a write method', function (done) {
      this.datastore.should.have.property('write')
      done()
    })

    it('must have a getUpload method', function (done) {
      this.datastore.should.have.property('getUpload')
      done()
    })
  })
}

export const shouldCreateUploads = function () {
  describe('create', () => {
    const file = new File(
      '1234',
      '1000',
      undefined,
      'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential'
    )
    const file_defered = new File('1234', undefined, '1')

    it('should resolve to file', async function () {
      const newFile = await this.datastore.create(file)
      assert.equal(newFile instanceof File, true)
    })

    it("should report 'creation' extension", function () {
      assert.equal(this.datastore.hasExtension('creation'), true)
    })

    it('should create new upload resource', async function () {
      await this.datastore.create(file)
      const data = await this.datastore.getUpload(file.id)
      assert.equal(data.size, 0)
    })

    it('should store `upload_length` when creating new resource', async function () {
      await this.datastore.create(file)
      const data = await this.datastore.getUpload(file.id)
      assert.strictEqual(data.upload_length, file.upload_length)
    })

    it('should store `upload_defer_length` when creating new resource', async function () {
      await this.datastore.create(file_defered)
      const data = await this.datastore.getUpload(file.id)
      assert.strictEqual(data.upload_defer_length, file_defered.upload_defer_length)
    })

    it('should store `upload_metadata` when creating new resource', async function () {
      await this.datastore.create(file)
      const data = await this.datastore.getUpload(file.id)
      assert.strictEqual(data.upload_metadata, file.upload_metadata)
    })
  })
}

export const shouldRemoveUploads = function () {
  const file = new File('1234', '1000')

  describe('remove (termination extension)', () => {
    it("should report 'termination' extension", function () {
      assert.equal(this.datastore.hasExtension('termination'), true)
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

export const shouldWriteUploads = function () {
  describe('write', () => {
    it('should reject write streams that can not be open', async function () {
      const stream = fs.createReadStream(this.testFilePath)
      return this.datastore.write(stream, 'doesnt_exist', 0).should.be.rejected()
    })

    it('should reject whean readable stream has an error', async function () {
      const stream = fs.createReadStream(this.testFilePath)
      return this.datastore.write(stream, 'doesnt_exist', 0).should.be.rejected()
    })

    it('should write a stream and resolve the new offset', async function () {
      const file = new File(
        '1234',
        `${this.testFileSize}`,
        undefined,
        'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential'
      )
      await this.datastore.create(file)
      const readable = fs.createReadStream(this.testFilePath)
      const offset = await this.datastore.write(readable, file.id, 0)
      assert.equal(offset, this.testFileSize)
    })

    it('should reject when stream is destroyed', async function () {
      const file = new File(
        '1234',
        `${this.testFileSize}`,
        undefined,
        'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential'
      )
      await this.datastore.create(file)
      const readable = new stream.Readable({
        read() {
          this.push('some data')
          this.destroy()
        },
      })
      const offset = this.datastore.write(readable, file.id, 0)
      return offset.should.be.rejected()
    })
  })
}

export const shouldHandleOffset = function () {
  describe('getUpload', function () {
    const file = new File(
      '1234',
      // @ts-expect-error todo
      `${this.testFileSize}`,
      undefined,
      'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential'
    )

    it('should reject non-existant files', function () {
      return this.datastore.getUpload('doesnt_exist').should.be.rejected()
    })

    it('should resolve the stats for existing files', async function () {
      await this.datastore.create(file)
      const offset = await this.datastore.write(
        fs.createReadStream(this.testFilePath),
        file.id,
        0
      )
      const data = await this.datastore.getUpload(file.id)
      assert.equal(data.size, offset)
    })
  })
}

export const shouldDeclareUploadLength = function () {
  describe('declareUploadLength', () => {
    const file = new File(
      '1234',
      undefined,
      '1',
      'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential'
    )

    it('should reject non-existant files', function () {
      return this.datastore.declareUploadLength('doesnt_exist', '10').should.be.rejected()
    })

    it('should update upload_length after declaring upload length', async function () {
      await this.datastore.create(file)
      let data = await this.datastore.getUpload(file.id)
      assert.equal(data.upload_length, undefined)
      assert.equal(data.upload_defer_length, '1')
      await this.datastore.declareUploadLength(file.id, '10')
      data = await this.datastore.getUpload(file.id)
      assert.equal(data.upload_length, '10')
      assert.equal(data.upload_defer_length, undefined)
    })
  })
}
