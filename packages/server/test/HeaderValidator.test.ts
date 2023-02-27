import {strict as assert} from 'node:assert'

import {invalidHeader} from '../src/validators/HeaderValidator'
import {TUS_RESUMABLE} from '../src/constants'

describe('HeaderValidator', () => {
  describe('upload-offset', () => {
    it('should validate a number', (done) => {
      const value = '1234'
      assert.equal(invalidHeader('upload-offset', value), false)
      done()
    })

    it('should invalidate a negative number', (done) => {
      const value = '-4'
      assert.equal(invalidHeader('upload-offset', value), true)
      done()
    })

    it('should invalidate a non number', (done) => {
      const value = 'hello'
      assert.equal(invalidHeader('upload-offset', value), true)
      done()
    })
  })

  describe('upload-length', () => {
    it('should validate a number', (done) => {
      const value = '1234'
      assert.equal(invalidHeader('upload-length', value), false)
      done()
    })

    it('should invalidate a number < 1', (done) => {
      assert.equal(invalidHeader('upload-length', '-1'), true)
      done()
    })

    it('should invalidate a non number', (done) => {
      const value = 'hello'
      assert.equal(invalidHeader('upload-length', value), true)
      done()
    })
  })

  describe('upload-defer-length', () => {
    it('should validate 1', (done) => {
      const value = '1'
      assert.equal(invalidHeader('upload-defer-length', value), false)
      done()
    })

    it('should invalidate a number !== 1', (done) => {
      assert.equal(invalidHeader('upload-defer-length', '0'), true)
      assert.equal(invalidHeader('upload-defer-length', '1234'), true)
      assert.equal(invalidHeader('upload-defer-length', '-1'), true)
      done()
    })

    it('should invalidate a non number', (done) => {
      const value = 'hello'
      assert.equal(invalidHeader('upload-defer-length', value), true)
      done()
    })
  })

  describe('upload-metadata', () => {
    it('should validate a comma separated list', (done) => {
      const value = 'hello world, tus rules'
      assert.equal(invalidHeader('upload-metadata', value), false)
      done()
    })

    it('should validate a singe value', (done) => {
      const value = 'hello world'
      assert.equal(invalidHeader('upload-metadata', value), false)
      done()
    })

    it('should validate keys without a value', (done) => {
      assert.equal(invalidHeader('upload-metadata', 'hello'), false)
      assert.equal(invalidHeader('upload-metadata', 'hello world, tusrules'), false)
      done()
    })

    it('should fail on non comma separated list', (done) => {
      assert.equal(invalidHeader('upload-metadata', 'too-many   spaces'), true)
      assert.equal(invalidHeader('upload-metadata', ''), true)
      assert.equal(invalidHeader('upload-metadata', '\t\n'), true)
      done()
    })
  })

  describe('upload-concat', () => {
    it('should validate partial and final', (done) => {
      assert.equal(invalidHeader('upload-concat', 'partial'), false)
      assert.equal(invalidHeader('upload-concat', 'final;/files/a /files/b'), false)
      done()
    })

    it('should invalidate everything else', (done) => {
      assert.equal(invalidHeader('upload-concat', ''), true)
      assert.equal(invalidHeader('upload-concat', 'PARTIAL'), true)
      assert.equal(invalidHeader('upload-concat', 'invalid-value'), true)
      done()
    })
  })

  describe('x-requested-with', () => {
    it('always validate ', (done) => {
      assert.equal(invalidHeader('x-requested-with'), false)
      done()
    })
  })

  describe('tus-version', () => {
    it('should validate tus version', (done) => {
      assert.equal(invalidHeader('tus-version', TUS_RESUMABLE), false)
      done()
    })

    it('should invalidate tus version', (done) => {
      assert.equal(invalidHeader('tus-version', '0.0.0'), true)
      assert.equal(invalidHeader('tus-version', '0.1.0'), true)
      done()
    })
  })

  describe('tus-resumable', () => {
    it('should validate tus version', (done) => {
      assert.equal(invalidHeader('tus-resumable', TUS_RESUMABLE), false)
      done()
    })

    it('should invalidate tus version', (done) => {
      assert.equal(invalidHeader('tus-resumable', '0.0.0'), true)
      assert.equal(invalidHeader('tus-resumable', '0.1.0'), true)
      done()
    })
  })

  describe('tus-extension', () => {
    it('always validate ', (done) => {
      assert.equal(invalidHeader('tus-extension'), false)
      done()
    })
  })

  describe('tus-max-size', () => {
    it('always validate ', (done) => {
      assert.equal(invalidHeader('tus-max-size'), false)
      done()
    })
  })

  describe('content-type', () => {
    it('should validate octet-stream', (done) => {
      assert.equal(
        invalidHeader('content-type', 'application/offset+octet-stream'),
        false
      )
      done()
    })

    it('should invalidate everything except octet-stream', (done) => {
      assert.equal(invalidHeader('content-type', 'video/mp4'), true)
      assert.equal(invalidHeader('content-type', 'application/json'), true)
      done()
    })
  })
})
