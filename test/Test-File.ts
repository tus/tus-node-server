import 'should'
import {strict as assert} from 'node:assert'

import File from '../lib/models/Upload'
import Uid from '../lib/models/Uid'

describe('File', () => {
  describe('constructor', () => {
    it('must require a file_name', () => {
      assert.throws(() => {
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 0.
        new File()
      }, Error)
    })

    it('should set properties given', () => {
      const id = Uid.rand()
      const size = 1234
      const offset = 0
      const metadata = 'metadata'
      const file = new File({id, size, offset, metadata})
      assert.equal(file.id, id)
      assert.equal(file.size, size)
      assert.equal(file.offset, offset)
      assert.equal(file.sizeIsDeferred, false)
      assert.equal(file.metadata, metadata)
    })
  })
})
