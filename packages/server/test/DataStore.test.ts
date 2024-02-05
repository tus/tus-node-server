import 'should'
import {strict as assert} from 'node:assert'

import {DataStore} from '@tus/utils'

describe('DataStore', () => {
  const datastore = new DataStore()

  it('should provide extensions', (done) => {
    datastore.should.have.property('extensions')
    assert.equal(Array.isArray(datastore.extensions), true)
    assert.equal(datastore.extensions.length, 0)
    datastore.extensions = ['creation', 'expiration']
    assert.deepStrictEqual(datastore.extensions, ['creation', 'expiration'])
    done()
  })

  it('should check for an extension', (done) => {
    datastore.extensions = ['creation', 'expiration']
    assert.equal(datastore.hasExtension('creation'), true)
    assert.equal(datastore.hasExtension('expiration'), true)
    assert.equal(datastore.hasExtension('concatentation'), false)
    assert.equal(datastore.hasExtension('CREATION'), false) // Test case sensitivity
    done()
  })

  it('must have a create method', (done) => {
    datastore.should.have.property('create')
    datastore.create.should.be.type('function')
    done()
  })

  it('must have a remove method', (done) => {
    datastore.should.have.property('remove')
    done()
  })

  it('must have a write method', (done) => {
    datastore.should.have.property('write')
    datastore.write.should.be.type('function')
    done()
  })

  it('must have a getUpload method', (done) => {
    datastore.should.have.property('getUpload')
    datastore.getUpload.should.be.type('function')
    done()
  })
})
