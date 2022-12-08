import os from 'node:os'
import fs from 'node:fs'
import stream from 'node:stream/promises'
import {strict as assert} from 'node:assert'

import {StreamSplitter} from '../src/models'

const fileSize = 20_971_520

describe('StreamSplitter', () => {
  it('should buffer chunks until optimal part size', async () => {
    const readStream = fs.createReadStream('../../test/fixtures/test.pdf')
    const optimalChunkSize = 8 * 1024 * 1024
    const parts = [optimalChunkSize, optimalChunkSize, fileSize - optimalChunkSize * 2]
    let offset = 0
    let index = 0
    const splitterStream = new StreamSplitter({
      chunkSize: optimalChunkSize,
      directory: os.tmpdir(),
    }).on('chunkFinished', ({size}) => {
      offset += size
      assert.equal(parts[index], size)
      index++
    })
    await stream.pipeline(readStream, splitterStream)
    assert.equal(offset, fileSize)
  })
})
