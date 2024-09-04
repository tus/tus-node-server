import {S3Store} from '@tus/s3-store'
import {Server, TUS_RESUMABLE} from '@tus/server'
import type {SuperAgentTest} from 'supertest'
import request from 'supertest'
import type http from 'node:http'
import {describe} from 'node:test'
import {strict as assert} from 'node:assert'
import {S3, S3ServiceException} from '@aws-sdk/client-s3'

const STORE_PATH = '/upload'

interface S3Options {
  partSize?: number
  useTags?: boolean
  expirationPeriodInMilliseconds?: number
}

const expireTime = 5000
const s3Credentials = {
  bucket: process.env.AWS_BUCKET as string,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
}

const s3Client = new S3(s3Credentials)

const createStore = (options: S3Options = {}) =>
  new S3Store({
    ...options,
    s3ClientConfig: s3Credentials,
  })

const createUpload = async (agent: SuperAgentTest, uploadLength?: number) => {
  const req = agent.post(STORE_PATH).set('Tus-Resumable', TUS_RESUMABLE)

  if (uploadLength) {
    req.set('Upload-Length', uploadLength.toString())
  } else {
    req.set('Upload-Defer-Length', '1')
  }

  const response = await req.expect(201)

  assert(Boolean(response.headers.location), 'location not returned')
  const uploadId = response.headers.location.split('/').pop()
  return {uploadId: uploadId as string, expires: response.headers['upload-expires']}
}

const allocMB = (mb: number) => Buffer.alloc(1024 * 1024 * mb)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const patchUpload = async (
  agent: SuperAgentTest,
  uploadId: string,
  data: Buffer,
  offset = 0,
  uploadLength?: number
) => {
  const req = agent
    .patch(`${STORE_PATH}/${uploadId}`)
    .set('Tus-Resumable', TUS_RESUMABLE)
    .set('Upload-Offset', offset.toString())
    .set('Content-Type', 'application/offset+octet-stream')

  if (uploadLength) {
    req.set('Upload-Length', uploadLength.toString())
  }

  const res = await req.send(data).expect(204)

  return {offset: Number.parseInt(res.headers['upload-offset'], 10)}
}

describe('S3 Store E2E', () => {
  describe('Expiration extension', () => {
    let server: Server
    let listener: http.Server
    let agent: SuperAgentTest
    let store: S3Store

    before((done) => {
      store = createStore({
        expirationPeriodInMilliseconds: expireTime,
        partSize: 5_242_880,
      })
      server = new Server({
        path: STORE_PATH,
        datastore: store,
      })
      listener = server.listen()
      agent = request.agent(listener)
      done()
    })

    let startTime: number
    beforeEach(() => {
      startTime = Date.now()
    })

    afterEach(async () => {
      const endTime = Date.now()
      const elapsedMs = (endTime - startTime) / 10

      if (elapsedMs < expireTime) {
        await wait(expireTime - elapsedMs + 100)
      }

      await store.deleteExpired()
    })

    after((done) => {
      listener.close(done)
    })

    it('should set Tus-Completed=false when the upload is not completed', async () => {
      const data = allocMB(11)
      const {uploadId} = await createUpload(agent, data.length)
      await patchUpload(agent, uploadId, data.subarray(0, 1024 * 1024 * 6))

      const {TagSet} = await s3Client.getObjectTagging({
        Bucket: s3Credentials.bucket,
        Key: `${uploadId}.info`,
      })

      assert(
        TagSet?.find((tag) => tag.Key === 'Tus-Completed')?.Value === 'false',
        'object tag Tus-Completed not set to "false"'
      )
    })

    it('should set Tus-Completed=true when the upload is completed', async () => {
      const data = allocMB(11)
      const {uploadId} = await createUpload(agent, data.length)
      const {offset} = await patchUpload(
        agent,
        uploadId,
        data.subarray(0, 1024 * 1024 * 6)
      )

      await patchUpload(agent, uploadId, data.subarray(offset), offset)

      const {TagSet} = await s3Client.getObjectTagging({
        Bucket: s3Credentials.bucket,
        Key: `${uploadId}.info`,
      })

      assert(
        TagSet?.find((tag) => tag.Key === 'Tus-Completed')?.Value === 'true',
        'object tag Tus-Completed not set to "true"'
      )
    })

    it('should not set tags when using useTags and the upload is not completed', async () => {
      const store = createStore({
        useTags: false,
        expirationPeriodInMilliseconds: expireTime,
        partSize: 5_242_880,
      })
      const server = new Server({
        path: STORE_PATH,
        datastore: store,
      })
      const listener = server.listen()
      agent = request.agent(listener)

      const data = allocMB(11)
      const {uploadId} = await createUpload(agent, data.length)
      await patchUpload(agent, uploadId, data.subarray(0, 1024 * 1024 * 6))

      const {TagSet} = await s3Client.getObjectTagging({
        Bucket: s3Credentials.bucket,
        Key: `${uploadId}.info`,
      })

      assert.equal(TagSet?.length, 0)

      await new Promise((resolve) => listener.close(resolve))
    })

    it('should not set tags when using useTags and the upload is completed', async () => {
      const store = createStore({
        useTags: false,
        expirationPeriodInMilliseconds: expireTime,
        partSize: 5_242_880,
      })
      const server = new Server({
        path: STORE_PATH,
        datastore: store,
      })
      const listener = server.listen()
      agent = request.agent(listener)

      const data = allocMB(11)
      const {uploadId} = await createUpload(agent, data.length)
      const {offset} = await patchUpload(
        agent,
        uploadId,
        data.subarray(0, 1024 * 1024 * 6)
      )

      await patchUpload(agent, uploadId, data.subarray(offset), offset)

      const {TagSet} = await s3Client.getObjectTagging({
        Bucket: s3Credentials.bucket,
        Key: `${uploadId}.info`,
      })

      assert.equal(TagSet?.length, 0)

      await new Promise((resolve) => listener.close(resolve))
    })

    // TODO: refactor to mocked integration test instead of e2e
    it.skip('calling deleteExpired will delete all expired objects', async () => {
      const data = allocMB(11)
      const {uploadId} = await createUpload(agent, data.length)
      await patchUpload(agent, uploadId, data.subarray(0, 1024 * 1024 * 6))

      const [infoFile, partFile] = await Promise.all([
        s3Client.getObject({
          Bucket: s3Credentials.bucket,
          Key: `${uploadId}.info`,
        }),
        s3Client.getObject({
          Bucket: s3Credentials.bucket,
          Key: `${uploadId}.part`,
        }),
      ])

      await store.deleteExpired()

      // make sure the files are not deleted
      assert(infoFile.$metadata.httpStatusCode === 200)
      assert(partFile.$metadata.httpStatusCode === 200)

      await wait(expireTime + 100)

      // .info file and .part should be deleted since now they should be expired
      const deletedFiles = await store.deleteExpired()
      assert(deletedFiles === 2, `not all parts were deleted, deleted ${deletedFiles}`)

      const files = await Promise.allSettled([
        s3Client.getObject({
          Bucket: s3Credentials.bucket,
          Key: `${uploadId}.info`,
        }),
        s3Client.getObject({
          Bucket: s3Credentials.bucket,
          Key: `${uploadId}.part`,
        }),
      ])

      assert(
        files.every((p) => p.status === 'rejected') === true,
        'fetching deleted object succeeded'
      )

      assert(
        files.every((p) => {
          assert(p.status === 'rejected')
          assert(
            p.reason instanceof S3ServiceException,
            'error is not of type S3ServiceException'
          )

          return p.reason.$metadata.httpStatusCode === 404
        }) === true,
        'not all rejections were 404'
      )
    })

    it('will not allow to upload to an expired url', async () => {
      const data = allocMB(11)
      const {uploadId} = await createUpload(agent, data.length)
      const {offset} = await patchUpload(
        agent,
        uploadId,
        data.subarray(0, 1024 * 1024 * 6)
      )

      await wait(expireTime + 100)

      await agent
        .patch(`${STORE_PATH}/${uploadId}`)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Offset', offset.toString())
        .set('Content-Type', 'application/offset+octet-stream')
        .send(data.subarray(offset))
        .expect(410)
    })
  })

  describe('Upload', () => {
    let server: Server
    let listener: http.Server
    let agent: SuperAgentTest
    let store: S3Store

    before((done) => {
      store = createStore({
        partSize: 5_242_880,
      })
      server = new Server({
        path: STORE_PATH,
        datastore: store,
      })
      listener = server.listen()
      agent = request.agent(listener)
      done()
    })

    after((done) => {
      listener.close(done)
    })

    it('can a upload a smaller file than the minPreferred size using a deferred length', async () => {
      const data = allocMB(1)
      const {uploadId} = await createUpload(agent)
      const {offset} = await patchUpload(agent, uploadId, data)
      const {offset: offset2} = await patchUpload(
        agent,
        uploadId,
        new Buffer(0),
        offset,
        data.length
      )

      assert.equal(offset2, data.length)

      const head = await s3Client.headObject({
        Bucket: s3Credentials.bucket,
        Key: uploadId,
      })

      assert.equal(head.$metadata.httpStatusCode, 200)
    })
  })
})
