import {strict as assert} from 'node:assert'
import path from 'node:path'

import {isPathInsideDirectory} from '../path.js'

const directory = path.resolve('uploads')

describe('isPathInsideDirectory', () => {
  it('accepts paths inside the directory', () => {
    assert.equal(isPathInsideDirectory(directory, path.join(directory, 'upload')), true)
  })

  it('rejects paths outside or equal to the directory', () => {
    assert.equal(isPathInsideDirectory(directory, directory), false)
    assert.equal(
      isPathInsideDirectory(directory, path.resolve(directory, '..', 'upload')),
      false
    )
  })

  it('rejects null bytes', () => {
    assert.equal(
      isPathInsideDirectory(directory, path.join(directory, 'upload\0')),
      false
    )
  })
})
