import {strict as assert} from 'node:assert'

import {validateHeader} from '../src/validators/HeaderValidator'
import {TUS_RESUMABLE} from '@tus/utils'

describe('HeaderValidator', () => {
  describe('upload-offset', () => {
    it('should validate a number', (done) => {
      const value = '1234'
      assert.equal(validateHeader('upload-offset', value), true)
      done()
    })

    it('should invalidate a negative number', (done) => {
      const value = '-4'
      assert.equal(validateHeader('upload-offset', value), false)
      done()
    })

    it('should invalidate a non number', (done) => {
      assert.equal(validateHeader('upload-length', 'hello'), false)
      assert.equal(validateHeader('upload-length', '0100'), false)
      assert.equal(validateHeader('upload-length', '0asd100'), false)
      assert.equal(validateHeader('upload-length', '1asd100'), false)
      done()
    })
  })

  describe('upload-length', () => {
    it('should validate a number', (done) => {
      const value = '1234'
      assert.equal(validateHeader('upload-length', value), true)
      done()
    })

    it('should invalidate a number < 0', (done) => {
      assert.equal(validateHeader('upload-length', '-1'), false)
      done()
    })

    it('should invalidate a non number', (done) => {
      assert.equal(validateHeader('upload-length', 'hello'), false)
      assert.equal(validateHeader('upload-length', '0100'), false)
      assert.equal(validateHeader('upload-length', '0asd100'), false)
      assert.equal(validateHeader('upload-length', '1asd100'), false)
      assert.equal(validateHeader('upload-length', '1.3'), false)
      assert.equal(validateHeader('upload-length', '-0'), false)
      assert.equal(validateHeader('upload-length', '+0'), false)
      assert.equal(validateHeader('upload-length', 'NaN'), false)
      assert.equal(validateHeader('upload-length', '+Infinity'), false)
      done()
    })
  })

  describe('upload-defer-length', () => {
    it('should validate 1', (done) => {
      const value = '1'
      assert.equal(validateHeader('upload-defer-length', value), true)
      done()
    })

    it('should invalidate a number !== 1', (done) => {
      assert.equal(validateHeader('upload-defer-length', '0'), false)
      assert.equal(validateHeader('upload-defer-length', '1234'), false)
      assert.equal(validateHeader('upload-defer-length', '-1'), false)
      assert.equal(validateHeader('upload-defer-length', '+1'), false)
      assert.equal(validateHeader('upload-defer-length', ' 1 '), false) // test leading and trailing whitespaces
      done()
    })

    it('should invalidate a non number', (done) => {
      const value = 'hello'
      assert.equal(validateHeader('upload-defer-length', value), false)
      done()
    })
  })

  describe('upload-metadata', () => {
    it('should validate a comma separated list', (done) => {
      const value =
        'file/name dGVzdC5tcDQ=,size OTYwMjQ0,type! dmlkZW8vbXA0,video,withWhitespace'
      assert.equal(validateHeader('upload-metadata', value), true)
      done()
    })

    it('should validate keys without a value', (done) => {
      assert.equal(validateHeader('upload-metadata', 'is_confidential'), true)
      done()
    })

    it('should fail on non comma separated list', (done) => {
      assert.equal(validateHeader('upload-metadata', 'too-many   spaces'), false)
      assert.equal(validateHeader('upload-metadata', ''), false)
      assert.equal(validateHeader('upload-metadata', '\t\n'), false)
      done()
    })
  })

  describe('upload-concat', () => {
    it('should validate partial and final', (done) => {
      assert.equal(validateHeader('upload-concat', 'partial'), true)
      assert.equal(validateHeader('upload-concat', 'final;/files/a /files/b'), true)
      done()
    })

    it('should invalidate everything else', (done) => {
      assert.equal(validateHeader('upload-concat', ''), false)
      assert.equal(validateHeader('upload-concat', 'PARTIAL'), false)
      assert.equal(validateHeader('upload-concat', 'invalid-value'), false)
      done()
    })
  })

  describe('x-requested-with', () => {
    it('always validate ', (done) => {
      assert.equal(validateHeader('x-requested-with'), true)
      done()
    })
  })

  describe('tus-version', () => {
    it('should validate tus version', (done) => {
      assert.equal(validateHeader('tus-version', TUS_RESUMABLE), true)
      done()
    })

    it('should invalidate tus version', (done) => {
      assert.equal(validateHeader('tus-version', '0.0.0'), false)
      assert.equal(validateHeader('tus-version', '0.1.0'), false)
      done()
    })
  })

  describe('tus-resumable', () => {
    it('should validate tus version', (done) => {
      assert.equal(validateHeader('tus-resumable', TUS_RESUMABLE), true)
      done()
    })

    it('should invalidate tus version', (done) => {
      assert.equal(validateHeader('tus-resumable', '0.0.0'), false)
      assert.equal(validateHeader('tus-resumable', '0.1.0'), false)
      done()
    })
  })

  describe('tus-extension', () => {
    it('always validate ', (done) => {
      assert.equal(validateHeader('tus-extension'), true)
      done()
    })
  })

  describe('tus-max-size', () => {
    it('always validate ', (done) => {
      assert.equal(validateHeader('tus-max-size'), true)
      done()
    })
  })

  describe('content-type', () => {
    it('should validate octet-stream', (done) => {
      assert.equal(
        validateHeader('content-type', 'application/offset+octet-stream'),
        true
      )
      done()
    })

    it('should invalidate everything except octet-stream', (done) => {
      assert.equal(validateHeader('content-type', 'video/mp4'), false)
      assert.equal(validateHeader('content-type', 'application/json'), false)
      done()
    })
  })
})
