import os from 'node:os'
import fs from 'node:fs'
import stream from 'node:stream/promises'
import {strict as assert} from 'node:assert'

import {StreamSplitter} from '../src/models'
import {Readable} from 'node:stream'

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

  it('should split to multiple chunks when single buffer exceeds chunk size', async () => {
    const optimalChunkSize = 1024
    const expectedChunks = 7

    const readStream = Readable.from([Buffer.alloc(expectedChunks * optimalChunkSize)])

    let chunksStarted = 0
    let chunksFinished = 0
    const splitterStream = new StreamSplitter({
      chunkSize: optimalChunkSize,
      directory: os.tmpdir(),
    })
      .on('chunkStarted', () => {
        chunksStarted++
      })
      .on('chunkFinished', () => {
        chunksFinished++
      })

    await stream.pipeline(readStream, splitterStream)

    assert.equal(chunksStarted, expectedChunks)
    assert.equal(chunksFinished, expectedChunks)
  })
})
