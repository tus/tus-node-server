import 'should'
import {strict as assert} from 'node:assert'

import File from '../lib/models/File'
import Uid from '../lib/models/Uid'

describe('File', () => {
  describe('constructor', () => {
    it('must require a file_name', () => {
      assert.throws(() => {
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 0.
        new File()
      }, Error)
    })

    it('must be given either a upload_length or upload_defer_length', () => {
      assert.throws(() => {
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 1.
        new File(Uid.rand())
      }, Error)
    })

    it('should set properties given', () => {
      const file_id = Uid.rand()
      const upload_length = 1234
      const upload_defer_length = 1
      const upload_metadata = 'metadata'
      const file = new File(file_id, upload_length, upload_defer_length, upload_metadata)
      assert.equal(file.id, file_id)
      assert.equal(file.upload_length, upload_length)
      assert.equal(file.upload_defer_length, upload_defer_length)
      assert.equal(file.upload_metadata, upload_metadata)
    })
  })
})
