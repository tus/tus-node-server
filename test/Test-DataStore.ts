import 'should'
import {strict as assert} from 'node:assert'

import DataStore from '../lib/stores/DataStore'

describe('DataStore', () => {
  // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
  const datastore = new DataStore({path: '/test/output'})
  it('should provide extensions', (done: any) => {
    datastore.should.have.property('extensions')
    assert.equal(datastore.extensions, null)
    datastore.extensions = ['creation', 'expiration']
    assert.equal(datastore.extensions, 'creation,expiration')
    done()
  })
  it('extensions must be an array', (done: any) => {
    assert.throws(() => {
      datastore.extensions = 'creation, expiration'
    }, Error)
    done()
  })
  it('should check for an extension', (done: any) => {
    datastore.extensions = ['creation', 'expiration']
    assert.equal(datastore.hasExtension('creation'), true)
    assert.equal(datastore.hasExtension('expiration'), true)
    assert.equal(datastore.hasExtension('concatentation'), false)
    assert.equal(datastore.hasExtension('CREATION'), false) // Test case sensitivity
    done()
  })
  it('must have a create method', (done: any) => {
    datastore.should.have.property('create')
    datastore.create.should.be.type('function')
    done()
  })
  it('must have a remove method', (done: any) => {
    datastore.should.have.property('remove')
    // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
    datastore.remove()
    done()
  })
  it('must have a write method', (done: any) => {
    datastore.should.have.property('write')
    datastore.write.should.be.type('function')
    done()
  })
  it('must have a getOffset method', (done: any) => {
    datastore.should.have.property('getOffset')
    datastore.getOffset.should.be.type('function')
    done()
  })
})
