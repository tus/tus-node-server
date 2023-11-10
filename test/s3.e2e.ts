import {S3Store} from '@tus/s3-store'
import {Server, TUS_RESUMABLE} from '@tus/server'
import {SuperAgentTest} from 'supertest'
import request from 'supertest'
import http from 'node:http'
import {describe} from 'node:test'
import {strict as assert} from 'node:assert'
import {S3} from '@aws-sdk/client-s3'
import sinon from 'sinon'

const STORE_PATH = '/upload'

interface S3Options {
  partSize?: number
  expirationPeriodInMilliseconds?: number
}

const s3Credentials = {
  bucket: 'tus-node-server-bucket',
  region: 'us-east-1',
  endpoint: 'http://localhost:9000',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 's3-storage',
    secretAccessKey: 'secret1234',
  },
}

const s3Client = new S3(s3Credentials)

const createStore = (options: S3Options = {}) =>
  new S3Store({
    ...options,
    s3ClientConfig: s3Credentials,
  })

const createUpload = async (agent: SuperAgentTest, uploadLength: number) => {
  const response = await agent
    .post(STORE_PATH)
    .set('Tus-Resumable', TUS_RESUMABLE)
    .set('Upload-Length', uploadLength.toString())
    .expect(201)

  assert(Boolean(response.headers.location), 'location not returned')
  const uploadId = response.headers.location.split('/').pop()
  return {uploadId: uploadId as string, expires: response.headers['upload-expires']}
}

const allocMB = (mb: number) => Buffer.alloc(1024 * 1024 * mb)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const stubListMultiPart = (store: S3Store, uploadId: string, expires: string) => {
  // @ts-ignore
  // Note: accessing private property for stabbing purpose
  sinon.stub(store.client, 'listMultipartUploads').callsFake(async () => {
    const upload = await s3Client.getObject({
      Bucket: s3Credentials.bucket,
      Key: uploadId + '.info',
    })

    return {
      Uploads: [
        {
          UploadId: upload.Metadata?.['upload-id'],
          Key: uploadId,
          Initiated: new Date(new Date(expires).getTime() - 1000),
        },
      ],
    }
  })
}

const patchUpload = async (
  agent: SuperAgentTest,
  uploadId: string,
  data: Buffer,
  offset = 0
) => {
  const res = await agent
    .patch(`${STORE_PATH}/${uploadId}`)
    .set('Tus-Resumable', TUS_RESUMABLE)
    .set('Upload-Offset', offset.toString())
    .set('Content-Type', 'application/offset+octet-stream')
    .send(data)
    .expect(204)

  return {offset: parseInt(res.headers['upload-offset'], 10)}
}

describe('S3 Store E2E', () => {
  describe('Expiration extension', () => {
    let server: Server
    let listener: http.Server
    let agent: SuperAgentTest
    let store: S3Store

    before((done) => {
      store = createStore({
        expirationPeriodInMilliseconds: 1000,
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

    it('should set Tus-Completed=false when the upload is not completed', async () => {
      const data = allocMB(11)
      const {uploadId} = await createUpload(agent, data.length)
      await patchUpload(agent, uploadId, data.subarray(0, 1024 * 1024 * 6))

      const {TagSet} = await s3Client.getObjectTagging({
        Bucket: s3Credentials.bucket,
        Key: uploadId + '.info',
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
        Key: uploadId + '.info',
      })

      assert(
        TagSet?.find((tag) => tag.Key === 'Tus-Completed')?.Value === 'true',
        'object tag Tus-Completed not set to "true"'
      )
    })

    it('calling deleteExpired will delete all expired objects', async () => {
      const data = allocMB(11)
      const {uploadId, expires} = await createUpload(agent, data.length)
      await patchUpload(agent, uploadId, data.subarray(0, 1024 * 1024 * 6))

      await wait(1100)

      // Note: Minio is not compliant with the `listMultipartUploads` method on the s3 spec, see https://github.com/minio/minio/issues/13246
      stubListMultiPart(store, uploadId, expires)

      // .info file and .part should be deleted
      const deletedFiles = await store.deleteExpired()
      assert(deletedFiles === 2, `not all parts were deleted, deleted ${deletedFiles}`)
    })

    it('will not allow to upload to an expired url', async () => {
      const data = allocMB(11)
      const {uploadId} = await createUpload(agent, data.length)
      const {offset} = await patchUpload(
        agent,
        uploadId,
        data.subarray(0, 1024 * 1024 * 6)
      )

      await wait(1100)

      await agent
        .patch(`${STORE_PATH}/${uploadId}`)
        .set('Tus-Resumable', TUS_RESUMABLE)
        .set('Upload-Offset', offset.toString())
        .set('Content-Type', 'application/offset+octet-stream')
        .send(data.subarray(offset))
        .expect(410)
    })
  })
})
