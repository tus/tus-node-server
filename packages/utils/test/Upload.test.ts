import 'should'
import {strict as assert} from 'node:assert'

import {Upload} from '../src/models/Upload'
import {Uid} from '../src/models/Uid'

describe('Upload', () => {
  describe('constructor', () => {
    it('must require a file_name', () => {
      assert.throws(() => {
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 0.
        new Upload()
      }, Error)
    })

    it('should set properties given', () => {
      const id = Uid.rand()
      const size = 1234
      const offset = 0
      const metadata = {foo: 'bar'}
      const upload = new Upload({id, size, offset, metadata})
      assert.equal(upload.id, id)
      assert.equal(upload.size, size)
      assert.equal(upload.offset, offset)
      assert.equal(upload.sizeIsDeferred, false)
      assert.equal(upload.metadata, metadata)
    })
  })
})
