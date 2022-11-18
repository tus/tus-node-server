import os from 'node:os'
import fs, {promises as fsProm} from 'node:fs'
import stream from 'node:stream/promises'
import http from 'node:http'

import aws from 'aws-sdk'
import debug from 'debug'

import DataStore from './DataStore'
import StreamSplitter from '../models/StreamSplitter'
import Upload from '../models/Upload'
import {ERRORS, TUS_RESUMABLE} from '../constants'

const log = debug('tus-node-server:stores:s3store')

function calcOffsetFromParts(parts?: aws.S3.Parts) {
  // @ts-expect-error object is not possibly undefined
  return parts && parts.length > 0 ? parts.reduce((a, b) => a + b.Size, 0) : 0
}

type Options = {bucket: string; partSize?: number} & aws.S3.Types.ClientConfiguration

type MetadataValue = {file: Upload; upload_id: string}
// Implementation (based on https://github.com/tus/tusd/blob/master/s3store/s3store.go)
//
// Once a new tus upload is initiated, multiple objects in S3 are created:
//
// First of all, a new info object is stored which contains (as Metadata) a JSON-encoded
// blob of general information about the upload including its size and meta data.
// This kind of objects have the suffix ".info" in their key.
//
// In addition a new multipart upload
// (http://docs.aws.amazon.com/AmazonS3/latest/dev/uploadobjusingmpu.html) is
// created. Whenever a new chunk is uploaded to tus-node-server using a PATCH request, a
// new part is pushed to the multipart upload on S3.
//
// If meta data is associated with the upload during creation, it will be added
// to the multipart upload and after finishing it, the meta data will be passed
// to the final object. However, the metadata which will be attached to the
// final object can only contain ASCII characters and every non-ASCII character
// will be replaced by a question mark (for example, "Menü" will be "Men?").
// However, this does not apply for the metadata returned by the `_getMetadata`
// function since it relies on the info object for reading the metadata.
// Therefore, HEAD responses will always contain the unchanged metadata, Base64-
// encoded, even if it contains non-ASCII characters.
//
// Once the upload is finished, the multipart upload is completed, resulting in
// the entire file being stored in the bucket. The info object, containing
// meta data is not deleted.
//
// Considerations
//
// In order to support tus' principle of resumable upload, S3's Multipart-Uploads
// are internally used.
// For each incoming PATCH request (a call to `write`), a new part is uploaded
// to S3.
export default class S3Store extends DataStore {
  bucket: string
  cache: Map<string, MetadataValue> = new Map()
  client: aws.S3
  preferredPartSize: number
  maxMultipartParts = 10_000 as const

  constructor(options: Options) {
    super()
    const {bucket, partSize, ...rest} = options
    this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length']
    this.bucket = bucket
    this.preferredPartSize = partSize || 8 * 1024 * 1024
    // TODO: why the old apiVersion?
    this.client = new aws.S3({apiVersion: '2006-03-01', region: 'eu-west-1', ...rest})
  }

  private async bucketExists() {
    try {
      const data = await this.client.headBucket({Bucket: this.bucket}).promise()
      if (!data) {
        throw new Error(`bucket "${this.bucket}" does not exist`)
      }

      log(`bucket "${this.bucket}" exists`)
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error(`[S3Store] bucket "${this.bucket}" does not exist`)
      }

      throw error
    }
  }

  /**
   * Creates a multipart upload on S3 attaching any metadata to it.
   * Also, a `${file_id}.info` file is created which holds some information
   * about the upload itself like: `upload_id`, `upload_length`, etc.
   */
  private async initMultipartUpload(file: Upload) {
    log(`[${file.id}] initializing multipart upload`)
    const parsedMetadata = this.parseMetadataString(file.metadata)
    type CreateRequest = Omit<aws.S3.Types.CreateMultipartUploadRequest, 'Metadata'> & {
      Metadata: Record<string, string>
    }
    const request: CreateRequest = {
      Bucket: this.bucket,
      Key: file.id,
      Metadata: {tus_version: TUS_RESUMABLE, offset: file.offset.toString()},
    }
    if (file.size) {
      request.Metadata.size = file.size.toString()
      request.Metadata.isSizeDeferred = 'false'
    } else {
      request.Metadata.isSizeDeferred = 'true'
    }

    if (file.metadata !== undefined) {
      request.Metadata.metadata = file.metadata
    }

    if (parsedMetadata.contentType) {
      request.ContentType = parsedMetadata.contentType.decoded
    }

    if (parsedMetadata.filename) {
      request.Metadata.original_name = parsedMetadata.filename.encoded
    }

    const res = await this.client.createMultipartUpload(request).promise()
    log(`[${file.id}] multipart upload created (${res.UploadId})`)
    return this.saveMetadata(file, res.UploadId as string)
  }

  /**
   * Saves upload metadata to a `${file_id}.info` file on S3.
   * Please note that the file is empty and the metadata is saved
   * on the S3 object's `Metadata` field, so that only a `headObject`
   * is necessary to retrieve the data.
   */
  private async saveMetadata(file: Upload, upload_id: string) {
    log(`[${file.id}] saving metadata`)
    await this.client
      .putObject({
        Bucket: this.bucket,
        Key: `${file.id}.info`,
        Body: '',
        Metadata: {
          file: JSON.stringify(file),
          upload_id,
          tus_version: TUS_RESUMABLE,
        },
      })
      .promise()
    log(`[${file.id}] metadata file saved`)
    return {file, upload_id}
  }

  /**
   * Retrieves upload metadata previously saved in `${file_id}.info`.
   * There's a small and simple caching mechanism to avoid multiple
   * HTTP calls to S3.
   */
  private async getMetadata(id: string): Promise<MetadataValue> {
    log(`[${id}] retrieving metadata`)
    const cached = this.cache.get(id)
    if (cached?.file) {
      log(`[${id}] metadata from cache`)
      return cached
    }

    log(`[${id}] metadata from s3`)
    const {Metadata} = await this.client
      .headObject({Bucket: this.bucket, Key: `${id}.info`})
      .promise()
    const file = JSON.parse(Metadata?.file as string)
    this.cache.set(id, {
      ...Metadata,
      file: new Upload({
        id,
        size: file.size ? Number.parseInt(file.size, 10) : undefined,
        offset: Number.parseInt(file.offset, 10),
        metadata: file.metadata,
      }),
      // Patch for Digital Ocean: if key upload_id (AWS, standard) doesn't exist in Metadata object, fallback to upload-id (DO)
      upload_id: (Metadata?.upload_id as string) || (Metadata?.['upload-id'] as string),
    })
    return this.cache.get(id) as MetadataValue
  }

  /**
   * Parses the Base64 encoded metadata received from the client.
   */
  private parseMetadataString(str?: string) {
    const pairs: Record<string, {encoded: string; decoded?: string}> = {}

    if (!str) {
      return pairs
    }

    for (const pair of str.split(',')) {
      const [key, encoded] = pair.split(' ')
      pairs[key] = {
        encoded,
        decoded: encoded ? Buffer.from(encoded, 'base64').toString('ascii') : undefined,
      }
    }

    return pairs
  }

  /**
   * Uploads a part/chunk to S3 from a temporary part file.
   */
  private async uploadPart(
    metadata: MetadataValue,
    readStream: fs.ReadStream,
    partNumber: number
  ): Promise<string> {
    const data = await this.client
      .uploadPart({
        Bucket: this.bucket,
        Key: metadata.file.id,
        UploadId: metadata.upload_id,
        PartNumber: partNumber,
        Body: readStream,
      })
      .promise()
    log(`[${metadata.file.id}] finished uploading part #${partNumber}`)
    return data.ETag as string
  }

  /**
   * Uploads a stream to s3 using multiple parts
   */
  private async processUpload(
    metadata: MetadataValue,
    readStream: http.IncomingMessage | fs.ReadStream,
    currentPartNumber: number,
    offset: number
  ): Promise<void> {
    const size = metadata.file.size as number
    const promises: Promise<void | string>[] = []
    let pendingChunkFilepath: string | null = null
    const splitterStream = new StreamSplitter({
      chunkSize: this.calcOptimalPartSize(size),
      directory: os.tmpdir(),
    })
      .on('chunkStarted', (filepath) => {
        pendingChunkFilepath = filepath
      })
      .on('chunkFinished', ({path, size: chunkSize}) => {
        pendingChunkFilepath = null
        offset += chunkSize
        const partNumber = currentPartNumber++
        const p = Promise.resolve()
          .then(() => {
            // Skip chunk if it is not last and is smaller than 5MB
            const is_last_chunk = size === offset
            if (!is_last_chunk && chunkSize < 5 * 1024 * 1024) {
              log(`[${metadata.file.id}] ignoring chuck smaller than 5MB`)
              return
            }

            return this.uploadPart(metadata, fs.createReadStream(path), partNumber)
          })
          .finally(() => {
            fs.rm(path, (err) => {
              if (err) {
                log(`[${metadata.file.id}] failed to remove file ${path}`, err)
              }
            })
          })
        promises.push(p)
      })

    try {
      await stream.pipeline(readStream, splitterStream)
    } catch (error) {
      if (pendingChunkFilepath !== null) {
        try {
          await fsProm.rm(pendingChunkFilepath)
        } catch {
          log(`[${metadata.file.id}] failed to remove chunk ${pendingChunkFilepath}`)
        }
      }

      promises.push(Promise.reject(error))
    } finally {
      await Promise.all(promises)
    }
  }

  /**
   * Completes a multipart upload on S3.
   * This is where S3 concatenates all the uploaded parts.
   */
  private async finishMultipartUpload(metadata: MetadataValue, parts: aws.S3.Parts) {
    const response = await this.client
      .completeMultipartUpload({
        Bucket: this.bucket,
        Key: metadata.file.id,
        UploadId: metadata.upload_id,
        MultipartUpload: {
          Parts: parts.map((part) => {
            return {
              ETag: part.ETag,
              PartNumber: part.PartNumber,
            }
          }),
        },
      })
      .promise()
    return response.Location
  }

  /**
   * Gets the number of complete parts/chunks already uploaded to S3.
   * Retrieves only consecutive parts.
   */
  private async retrieveParts(
    id: string,
    partNumberMarker?: number
  ): Promise<aws.S3.Parts | undefined> {
    const params: aws.S3.ListPartsRequest = {
      Bucket: this.bucket,
      Key: id,
      UploadId: this.cache.get(id)?.upload_id as string,
    }
    if (partNumberMarker) {
      params.PartNumberMarker = partNumberMarker
    }

    const data = await this.client.listParts(params).promise()
    if (data.NextPartNumberMarker) {
      return this.retrieveParts(id, data.NextPartNumberMarker).then((parts) => {
        return [...(data.Parts as aws.S3.Parts), ...(parts as aws.S3.Parts)]
      })
    }

    const parts = data.Parts

    if (parts && !partNumberMarker) {
      return (
        parts
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          .sort((a, b) => a.PartNumber! - b.PartNumber!)
          .filter((value, index) => value.PartNumber === index + 1)
      )
    }

    return parts
  }

  /**
   * Removes cached data for a given file.
   */
  private clearCache(id: string) {
    log(`[${id}] removing cached data`)
    this.cache.delete(id)
  }

  private calcOptimalPartSize(size: number): number {
    let optimalPartSize: number

    // When upload is smaller or equal to PreferredPartSize, we upload in just one part.
    if (size <= this.preferredPartSize) {
      optimalPartSize = size
    }
    // Does the upload fit in MaxMultipartParts parts or less with PreferredPartSize.
    else if (size <= this.preferredPartSize * this.maxMultipartParts) {
      optimalPartSize = this.preferredPartSize
      // Prerequisite: Be aware, that the result of an integer division (x/y) is
      // ALWAYS rounded DOWN, as there are no digits behind the comma.
      // In order to find out, whether we have an exact result or a rounded down
      // one, we can check, whether the remainder of that division is 0 (x%y == 0).
      //
      // So if the result of (size/MaxMultipartParts) is not a rounded down value,
      // then we can use it as our optimalPartSize. But if this division produces a
      // remainder, we have to round up the result by adding +1. Otherwise our
      // upload would not fit into MaxMultipartParts number of parts with that
      // size. We would need an additional part in order to upload everything.
      // While in almost all cases, we could skip the check for the remainder and
      // just add +1 to every result, but there is one case, where doing that would
      // doom our upload. When (MaxObjectSize == MaxPartSize * MaxMultipartParts),
      // by adding +1, we would end up with an optimalPartSize > MaxPartSize.
      // With the current S3 API specifications, we will not run into this problem,
      // but these specs are subject to change, and there are other stores as well,
      // which are implementing the S3 API (e.g. RIAK, Ceph RadosGW), but might
      // have different settings.
    } else if (size % this.maxMultipartParts === 0) {
      optimalPartSize = size / this.maxMultipartParts
      // Having a remainder larger than 0 means, the float result would have
      // digits after the comma (e.g. be something like 10.9). As a result, we can
      // only squeeze our upload into MaxMultipartParts parts, if we rounded UP
      // this division's result. That is what is happending here. We round up by
      // adding +1, if the prior test for (remainder == 0) did not succeed.
    } else {
      optimalPartSize = size / this.maxMultipartParts + 1
    }

    return optimalPartSize
  }

  public async create(upload: Upload) {
    try {
      await this.bucketExists()
      await this.initMultipartUpload(upload)
    } catch (error) {
      this.clearCache(upload.id)
      throw error
    }

    return upload
  }

  /**
   * Write to the file, starting at the provided offset
   */
  public async write(
    readable: http.IncomingMessage | fs.ReadStream,
    id: string
  ): Promise<number> {
    // Metadata request needs to happen first
    const metadata = await this.getMetadata(id)
    let parts = await this.retrieveParts(id)
    let offset = calcOffsetFromParts(parts)
    const partNumber = parts?.length ?? 0
    const nextPartNumber = partNumber + 1

    await this.processUpload(metadata, readable, nextPartNumber, offset)

    try {
      parts = await this.retrieveParts(id)
      offset = calcOffsetFromParts(parts)
    } catch (error) {
      if (error.code === 'RequestTimeout') {
        log(
          'Request "close" event was emitted, however S3 was expecting more data. Failing gracefully.'
        )
        return metadata.file.offset
      }

      if (error.code === 'NoSuchUpload') {
        log(
          'Request "close" event was emitted, however S3 was expecting more data. Most likely the upload is already finished/aborted. Failing gracefully.'
        )
        return metadata.file.offset
      }

      this.clearCache(id)
      log(`[${id}] failed to write file`, error)
      throw error
    }

    if (metadata.file.size === offset) {
      try {
        await this.finishMultipartUpload(metadata, parts as aws.S3.Parts)
        this.clearCache(id)
        return offset
      } catch (error) {
        log(`[${id}] failed to finish upload`, error)
        throw error
      }
    }

    return offset
  }

  public async getUpload(id: string): Promise<Upload> {
    let metadata: MetadataValue
    try {
      metadata = await this.getMetadata(id)
    } catch (error) {
      log('getUpload: No file found.', error)
      throw ERRORS.FILE_NOT_FOUND
    }

    try {
      const parts = await this.retrieveParts(id)
      return new Upload({
        id,
        ...this.cache.get(id)?.file,
        offset: calcOffsetFromParts(parts),
        size: metadata.file.size,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.code !== 'NoSuchUpload') {
        log(error)
        throw error
      }

      // When the last part of an upload is finished and the file is successfully written to S3,
      // the upload will no longer be present and requesting it will result in a 404.
      // In that case we return the upload_length as size.
      return new Upload({
        id,
        ...this.cache.get(id)?.file,
        offset: metadata.file.offset,
        size: metadata.file.size,
      })
    }
  }

  public async declareUploadLength(file_id: string, upload_length: number) {
    const {file, upload_id} = await this.getMetadata(file_id)
    if (!file) {
      throw ERRORS.FILE_NOT_FOUND
    }

    file.size = upload_length

    this.saveMetadata(file, upload_id)
  }
}
