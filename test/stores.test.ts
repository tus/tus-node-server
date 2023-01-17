import 'should'
import {strict as assert} from 'node:assert'
import fs from 'node:fs'
import stream from 'node:stream'

import {Upload} from '@tus/server'

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
    const file = new Upload({
      id: 'create-test',
      size: 1000,
      offset: 0,
      metadata: {filename: 'world_domination_plan.pdf', is_confidential: null},
    })
    const file_defered = new Upload({
      id: 'create-test-deferred',
      offset: 0,
    })

    it('should resolve to file', async function () {
      const newFile = await this.datastore.create(file)
      assert.equal(newFile instanceof Upload, true)
    })

    it("should report 'creation' extension", function () {
      assert.equal(this.datastore.hasExtension('creation'), true)
    })

    it('should create new upload resource', async function () {
      await this.datastore.create(file)
      const upload = await this.datastore.getUpload(file.id)
      assert.equal(upload.offset, 0)
    })

    it('should store `upload_length` when creating new resource', async function () {
      await this.datastore.create(file)
      const upload = await this.datastore.getUpload(file.id)
      assert.strictEqual(upload.size, file.size)
    })

    it('should store `upload_defer_length` when creating new resource', async function () {
      await this.datastore.create(file_defered)
      const upload = await this.datastore.getUpload(file_defered.id)
      assert.strictEqual(upload.sizeIsDeferred, file_defered.sizeIsDeferred)
    })

    it('should store `upload_metadata` when creating new resource', async function () {
      await this.datastore.create(file)
      const upload = await this.datastore.getUpload(file.id)
      assert.deepStrictEqual(upload.metadata, file.metadata)
    })
  })
}

export const shouldRemoveUploads = function () {
  const file = new Upload({id: 'remove-test', size: 1000, offset: 0})

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
      const file = new Upload({
        id: 'write-test',
        size: this.testFileSize,
        offset: 0,
        metadata: {filename: 'world_domination_plan.pdf', is_confidential: null},
      })
      await this.datastore.create(file)
      const readable = fs.createReadStream(this.testFilePath)
      const offset = await this.datastore.write(readable, file.id, 0)
      assert.equal(offset, this.testFileSize)
    })

    it('should reject when stream is destroyed', async function () {
      const file = new Upload({
        id: 'write-test-reject',
        size: this.testFileSize,
        offset: 0,
        metadata: {filename: 'world_domination_plan.pdf', is_confidential: null},
      })
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
    it('should reject non-existant files', function () {
      return this.datastore.getUpload('doesnt_exist').should.be.rejected()
    })

    it('should resolve the stats for existing files', async function () {
      const file = new Upload({
        id: 'offset-test',
        size: this.testFileSize,
        offset: 0,
        metadata: {filename: 'world_domination_plan.pdf', is_confidential: null},
      })

      await this.datastore.create(file)
      const offset = await this.datastore.write(
        fs.createReadStream(this.testFilePath),
        file.id,
        file.offset
      )
      const upload = await this.datastore.getUpload(file.id)
      assert.equal(upload.offset, offset)
    })
  })
}

export const shouldDeclareUploadLength = function () {
  describe('declareUploadLength', () => {
    it('should reject non-existant files', function () {
      return this.datastore.declareUploadLength('doesnt_exist', '10').should.be.rejected()
    })

    it('should update upload_length after declaring upload length', async function () {
      const file = new Upload({
        id: 'declare-length-test',
        offset: 0,
        metadata: {filename: 'world_domination_plan.pdf', is_confidential: null},
      })

      await this.datastore.create(file)
      let upload = await this.datastore.getUpload(file.id)
      assert.equal(upload.size, undefined)
      assert.equal(upload.sizeIsDeferred, true)
      await this.datastore.declareUploadLength(file.id, 10)
      upload = await this.datastore.getUpload(file.id)
      assert.equal(upload.size, 10)
      assert.equal(upload.sizeIsDeferred, false)
    })
  })
}
