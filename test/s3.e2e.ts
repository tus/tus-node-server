import {S3Store} from '@tus/s3-store'
import {Server, TUS_RESUMABLE} from '@tus/server'
import {SuperAgentTest} from 'supertest'
import request from 'supertest'
import http from 'node:http'
import {describe} from 'node:test'
import {strict as assert} from 'node:assert'
import {S3, S3ServiceException} from '@aws-sdk/client-s3'
import {randomUUID} from 'crypto'

const STORE_PATH = '/upload'

interface S3Options {
  partSize?: number
  expirationPeriodInMilliseconds?: number
}

const expireTime = 5000
const s3Credentials = {
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
}

const s3Client = new S3(s3Credentials)

function createBucket(bucketName: string) {
  return s3Client.createBucket({
    Bucket: bucketName,
  })
}

function deleteBucket(bucketName: string) {
  return s3Client.deleteBucket({
    Bucket: bucketName,
  })
}

async function cleanObjects(bucketName: string) {
  while (true) {
    const listObjects = await s3Client.listObjects({
      Bucket: bucketName,
    })

    const objects = listObjects.Contents
    if (!objects || (objects && objects.length === 0)) {
      break
    }
    await s3Client.deleteObjects({
      Bucket: bucketName,
      Delete: {
        Objects: objects.map((o) => ({
          Key: o.Key as string,
        })),
      },
    })
  }
}

async function cleanMultiparts(bucketName: string) {
  while (true) {
    const multiParts = await s3Client.listMultipartUploads({
      Bucket: bucketName,
    })

    if (!multiParts.Uploads || (multiParts.Uploads && multiParts.Uploads.length === 0)) {
      break
    }

    await Promise.all(
      multiParts.Uploads?.map(async (upload) => {
        return s3Client.abortMultipartUpload({
          Bucket: bucketName,
          Key: upload.Key,
          UploadId: upload.UploadId,
        })
      })
    )
  }
}

async function cleanBucket(bucketName: string) {
  await Promise.all([cleanObjects(bucketName), cleanMultiparts(bucketName)])
}

const createStore = (bucketName: string, options: S3Options = {}) =>
  new S3Store({
    ...options,
    s3ClientConfig: {
      bucket: bucketName,
      ...s3Credentials,
    },
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
    let bucketName: string

    before(async () => {
      bucketName = `tus-s3-e2e-${randomUUID()}`
      await createBucket(bucketName)
      console.log(`Execution tests on bucket: ${bucketName}`)

      store = createStore(bucketName, {
        expirationPeriodInMilliseconds: expireTime,
        partSize: 5_242_880,
      })
      server = new Server({
        path: STORE_PATH,
        datastore: store,
      })
      listener = server.listen()
      agent = request.agent(listener)
    })

    beforeEach(async () => {
      await cleanBucket(bucketName)
    })

    after(async () => {
      await deleteBucket(bucketName)
      await new Promise((resolve) => listener.close(resolve))
    })

    it('should set Tus-Completed=false when the upload is not completed', async () => {
      const data = allocMB(11)
      const {uploadId} = await createUpload(agent, data.length)
      await patchUpload(agent, uploadId, data.subarray(0, 1024 * 1024 * 6))

      const {TagSet} = await s3Client.getObjectTagging({
        Bucket: bucketName,
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
        Bucket: bucketName,
        Key: uploadId + '.info',
      })

      assert(
        TagSet?.find((tag) => tag.Key === 'Tus-Completed')?.Value === 'true',
        'object tag Tus-Completed not set to "true"'
      )
    })

    it('calling deleteExpired will delete all expired objects', async () => {
      const data = allocMB(11)
      const {uploadId} = await createUpload(agent, data.length)
      await patchUpload(agent, uploadId, data.subarray(0, 1024 * 1024 * 6))

      const [infoFile, partFile] = await Promise.all([
        s3Client.getObject({
          Bucket: bucketName,
          Key: uploadId + '.info',
        }),
        s3Client.getObject({
          Bucket: bucketName,
          Key: uploadId + '.part',
        }),
      ])

      await store.deleteExpired()

      // make sure the files are not deleted
      assert(infoFile.$metadata.httpStatusCode === 200)
      assert(partFile.$metadata.httpStatusCode === 200)

      await wait(expireTime + 500)

      // .info file and .part should be deleted since now they should be expired
      const deletedFiles = await store.deleteExpired()
      assert(deletedFiles === 2, `not all parts were deleted, deleted ${deletedFiles}`)

      const files = await Promise.allSettled([
        s3Client.getObject({
          Bucket: bucketName,
          Key: uploadId + '.info',
        }),
        s3Client.getObject({
          Bucket: bucketName,
          Key: uploadId + '.part',
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
})
