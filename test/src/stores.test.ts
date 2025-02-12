import 'should'
import {strict as assert} from 'node:assert'
import fs from 'node:fs'
import stream from 'node:stream'
import {setTimeout as promSetTimeout} from 'node:timers/promises'

import {Upload, Uid} from '@tus/server'

export function testId(id: string) {
  return `${id}-${Uid.rand()}`
}

export const shouldHaveStoreMethods = () => {
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

export const shouldCreateUploads = () => {
  describe('create', () => {
    const file = new Upload({
      id: testId('create-test'),
      size: 1000,
      offset: 0,
      metadata: {filename: 'world_domination_plan.pdf', is_confidential: null},
    })
    const file_defered = new Upload({
      id: testId('create-test-deferred'),
      offset: 0,
    })

    it('should resolve to file', async function () {
      const newFile = await this.datastore.create(file)
      assert.ok(newFile.storage.path)
      assert.ok(newFile.storage.type)
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

    it('should store `upload_metadata` with non-ASCII characters', async function () {
      const file = new Upload({
        id: testId('create-test-non-ascii'),
        size: 1000,
        offset: 0,
        metadata: {filename: '世界_domination_plan.pdf', is_confidential: null},
      })
      await this.datastore.create(file)
      const upload = await this.datastore.getUpload(file.id)
      assert.deepStrictEqual(upload.metadata, file.metadata)
    })
  })
}

export const shouldExpireUploads = () => {
  describe('expiration extension', () => {
    it("should report 'expiration' extension", function () {
      assert.equal(this.datastore.hasExtension('expiration'), true)
    })

    it('should expire upload', async function () {
      const file = new Upload({
        id: testId('expiration-test'),
        size: this.testFileSize,
        offset: 0,
        metadata: {filename: 'world_domination_plan.pdf', is_confidential: null},
      })
      this.datastore.expirationPeriodInMilliseconds = 100
      await this.datastore.create(file)
      const readable = fs.createReadStream(this.testFilePath)
      const offset = await this.datastore.write(readable, file.id, 0)
      await promSetTimeout(100)
      const n = await this.datastore.deleteExpired()
      assert.equal(offset, this.testFileSize)
      assert.equal(n, 1)
    })
  })
}

export const shouldRemoveUploads = () => {
  const file = new Upload({id: testId('remove-test'), size: 1000, offset: 0})

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

    it('should delete the file during upload', async function () {
      const file = new Upload({
        id: testId('termination-test'),
        size: this.testFileSize,
        offset: 0,
        metadata: {filename: 'terminate_during_upload.pdf', is_confidential: null},
      })
      await this.datastore.create(file)

      const readable = fs.createReadStream(this.testFilePath, {
        highWaterMark: 100 * 1024,
      })
      // Pause between chunks read to make sure that file is still uploading when terminate function is invoked
      readable.on('data', () => {
        readable.pause()
        setTimeout(() => readable.resume(), 1000)
      })

      await Promise.allSettled([
        this.datastore.write(readable, file.id, 0),
        this.datastore.remove(file.id),
      ])

      try {
        await this.datastore.getUpload(file.id)
        assert.fail('getUpload should have thrown an error')
      } catch (error) {
        assert.equal([404, 410].includes(error?.status_code), true)
      }

      readable.destroy()
    })
  })
}

export const shouldWriteUploads = () => {
  describe('write', () => {
    it('should reject write streams that can not be open', async function () {
      const stream = fs.createReadStream(this.testFilePath)
      return this.datastore.write(stream, 'doesnt_exist', 0).should.be.rejected()
    })

    it('should reject when readable stream has an error', async function () {
      const stream = fs.createReadStream(this.testFilePath)
      return this.datastore.write(stream, 'doesnt_exist', 0).should.be.rejected()
    })

    it('should write a stream and resolve the new offset', async function () {
      const file = new Upload({
        id: testId('write-test'),
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
        id: testId('write-test-reject'),
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

export const shouldHandleOffset = () => {
  describe('getUpload', () => {
    it('should reject non-existant files', function () {
      return this.datastore.getUpload('doesnt_exist').should.be.rejected()
    })

    it('should resolve the stats for existing files', async function () {
      const file = new Upload({
        id: testId('offset-test'),
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

export const shouldDeclareUploadLength = () => {
  describe('declareUploadLength', () => {
    it('should reject non-existant files', function () {
      return this.datastore.declareUploadLength('doesnt_exist', '10').should.be.rejected()
    })

    it('should update upload_length after declaring upload length', async function () {
      const file = new Upload({
        id: testId('declare-length-test'),
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
