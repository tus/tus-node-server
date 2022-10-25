// TODO: refactor to fs/promises and S3 with async/await
import {strict as assert} from 'node:assert'
import os from 'node:os'
import fs from 'node:fs'
import stream from 'node:stream'
import http from 'node:http'

import aws from 'aws-sdk'

import DataStore from './DataStore'
import FileStreamSplitter from '../models/StreamSplitter'
import {ERRORS, TUS_RESUMABLE} from '../constants'

import debug from 'debug'
import {File} from '../../types'

const log = debug('tus-node-server:stores:s3store')

type Options = {
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region?: string
  partSize?: number
}

type MetadataValue = {file: File; upload_id: string}
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
class S3Store extends DataStore {
  bucket_name: string
  // TODO: is a `WeakMap` better here?
  cache: Map<string, MetadataValue> = new Map()
  client: aws.S3
  part_size: number

  constructor(options: Options) {
    super()
    assert.ok(options.accessKeyId, '[S3Store] `accessKeyId` must be set')
    assert.ok(options.secretAccessKey, '[S3Store] `secretAccessKey` must be set')
    assert.ok(options.bucket, '[S3Store] `bucket` must be set')

    this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length']
    this.bucket_name = options.bucket
    this.part_size = options.partSize || 8 * 1024 * 1024
    delete options.partSize // TODO: what is the point of passing `partSize` when it is deleted immediately?
    this.client = new aws.S3({
      apiVersion: '2006-03-01',
      region: 'eu-west-1',
      ...options,
    })
  }

  _bucketExists() {
    return this.client
      .headBucket({Bucket: this.bucket_name})
      .promise()
      .then((data) => {
        if (!data) {
          throw new Error(`bucket "${this.bucket_name}" does not exist`)
        }

        log(`bucket "${this.bucket_name}" exists`)
        return data
      })
      .catch((error_) => {
        if (error_.statusCode === 404) {
          throw new Error(`[S3Store] bucket "${this.bucket_name}" does not exist`)
        }

        throw new Error(error_)
      })
  }

  /**
   * Creates a multipart upload on S3 attaching any metadata to it.
   * Also, a `${file_id}.info` file is created which holds some information
   * about the upload itself like: `upload_id`, `upload_length`, etc.
   */
  _initMultipartUpload(file: File) {
    log(`[${file.id}] initializing multipart upload`)
    const parsedMetadata = this._parseMetadataString(file.upload_metadata)
    type Data = {
      Bucket: string
      Key: string
      ContentType?: string
      Metadata: {
        tus_version: string
        original_name?: string
        upload_length?: string
        upload_defer_length?: string
        upload_metadata?: string
      }
    }
    const upload_data: Data = {
      Bucket: this.bucket_name,
      Key: file.id,
      Metadata: {
        tus_version: TUS_RESUMABLE,
      },
    }
    if (file.upload_length !== undefined) {
      upload_data.Metadata.upload_length = file.upload_length
    }

    if (file.upload_defer_length !== undefined) {
      upload_data.Metadata.upload_defer_length = file.upload_defer_length
    }

    if (file.upload_metadata !== undefined) {
      upload_data.Metadata.upload_metadata = file.upload_metadata
    }

    if (parsedMetadata.contentType) {
      upload_data.ContentType = parsedMetadata.contentType.decoded
    }

    if (parsedMetadata.filename) {
      upload_data.Metadata.original_name = parsedMetadata.filename.encoded
    }

    return this.client
      .createMultipartUpload(upload_data)
      .promise()
      .then((data) => {
        log(`[${file.id}] multipart upload created (${data.UploadId})`)
        return data.UploadId
      })
      .then((upload_id) => {
        return this._saveMetadata(file, upload_id as string)
      })
      .catch((error) => {
        throw error
      })
  }

  /**
   * Saves upload metadata to a `${file_id}.info` file on S3.
   * Please note that the file is empty and the metadata is saved
   * on the S3 object's `Metadata` field, so that only a `headObject`
   * is necessary to retrieve the data.
   */
  _saveMetadata(file: File, upload_id: string) {
    log(`[${file.id}] saving metadata`)
    const metadata = {
      file: JSON.stringify(file),
      upload_id,
      tus_version: TUS_RESUMABLE,
    }
    return this.client
      .putObject({
        Bucket: this.bucket_name,
        Key: `${file.id}.info`,
        Body: '',
        Metadata: metadata,
      })
      .promise()
      .then(() => {
        log(`[${file.id}] metadata file saved`)
        return {
          file,
          upload_id,
        }
      })
      .catch((error) => {
        throw error
      })
  }

  /**
   * Retrieves upload metadata previously saved in `${file_id}.info`.
   * There's a small and simple caching mechanism to avoid multiple
   * HTTP calls to S3.
   */
  _getMetadata(file_id: string): Promise<MetadataValue> {
    log(`[${file_id}] retrieving metadata`)
    const cached = this.cache.get(file_id)
    if (cached?.file) {
      log(`[${file_id}] metadata from cache`)
      return Promise.resolve(cached)
    }

    log(`[${file_id}] metadata from s3`)
    return this.client
      .headObject({
        Bucket: this.bucket_name,
        Key: `${file_id}.info`,
      })
      .promise()
      .then(({Metadata}) => {
        this.cache.set(file_id, {
          ...Metadata,
          file: JSON.parse(Metadata?.file as string),
          // Patch for Digital Ocean: if key upload_id (AWS, standard) doesn't exist in Metadata object, fallback to upload-id (DO)
          upload_id:
            (Metadata?.upload_id as string) || (Metadata?.['upload-id'] as string),
        })
        return this.cache.get(file_id) as MetadataValue
      })
      .catch((error) => {
        throw error
      })
  }

  /**
   * Parses the Base64 encoded metadata received from the client.
   */
  _parseMetadataString(metadata_string?: string) {
    const pairs: Record<string, {encoded: string; decoded?: string}> = {}

    if (!metadata_string) {
      return pairs
    }

    for (const pair of metadata_string.split(',')) {
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
  _uploadPart(
    metadata: MetadataValue,
    read_stream: fs.ReadStream,
    current_part_number: number
  ) {
    return this.client
      .uploadPart({
        Bucket: this.bucket_name,
        Key: metadata.file.id,
        UploadId: metadata.upload_id,
        PartNumber: current_part_number,
        Body: read_stream,
      })
      .promise()
      .then((data) => {
        log(`[${metadata.file.id}] finished uploading part #${current_part_number}`)
        return data.ETag
      })
  }

  /**
   * Uploads a stream to s3 using multiple parts
   */
  _processUpload(
    metadata: MetadataValue,
    readStream: http.IncomingMessage | fs.ReadStream,
    currentPartNumber: number,
    current_size: number
  ): Promise<Promise<void | string>[]> {
    return new Promise((resolve) => {
      const splitterStream = new FileStreamSplitter({
        maxChunkSize: this.part_size,
        directory: os.tmpdir(),
      })
      const promises: Promise<void | string>[] = []
      let pendingChunkFilepath: string | null = null
      stream.pipeline(readStream, splitterStream, (pipelineErr) => {
        if (pipelineErr && pendingChunkFilepath !== null) {
          fs.rm(pendingChunkFilepath, (fileRemoveErr) => {
            if (fileRemoveErr) {
              log(`[${metadata.file.id}] failed to remove chunk ${pendingChunkFilepath}`)
            }
          })
        }

        promises.push(pipelineErr ? Promise.reject(pipelineErr) : Promise.resolve())
        resolve(promises)
      })
      splitterStream.on('chunkStarted', (filepath) => {
        pendingChunkFilepath = filepath
      })
      splitterStream.on('chunkFinished', ({path, size}) => {
        pendingChunkFilepath = null
        current_size += size
        const partNumber = currentPartNumber++
        const p = Promise.resolve()
          .then(() => {
            // Skip chunk if it is not last and is smaller than 5MB
            const is_last_chunk =
              Number.parseInt(metadata?.file?.upload_length ?? '', 10) === current_size
            if (!is_last_chunk && size < 5 * 1024 * 1024) {
              log(`[${metadata.file.id}] ignoring chuck smaller than 5MB`)
              return
            }

            return this._uploadPart(metadata, fs.createReadStream(path), partNumber)
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
    })
  }

  /**
   * Completes a multipart upload on S3.
   * This is where S3 concatenates all the uploaded parts.
   */
  _finishMultipartUpload(metadata: MetadataValue, parts: aws.S3.Parts) {
    return this.client
      .completeMultipartUpload({
        Bucket: this.bucket_name,
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
      .then((result) => result.Location)
      .catch((error) => {
        throw error
      })
  }

  /**
   * Gets the number of complete parts/chunks already uploaded to S3.
   * Retrieves only consecutive parts.
   */
  _retrieveParts(
    file_id: string,
    part_number_marker?: number
  ): Promise<aws.S3.Parts | undefined> {
    const params: aws.S3.ListPartsRequest = {
      Bucket: this.bucket_name,
      Key: file_id,
      UploadId: this.cache.get(file_id)?.upload_id as string,
    }
    if (part_number_marker) {
      params.PartNumberMarker = part_number_marker
    }

    return this.client
      .listParts(params)
      .promise()
      .then((data) => {
        if (data.NextPartNumberMarker) {
          return this._retrieveParts(file_id, data.NextPartNumberMarker).then((parts) => {
            return [...(data.Parts as aws.S3.Parts), ...(parts as aws.S3.Parts)]
          })
        }

        return data.Parts
      })
      .then((parts) => {
        if (parts && !part_number_marker) {
          return (
            parts
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              .sort((a, b) => a.PartNumber! - b.PartNumber!)
              .filter((value, index) => value.PartNumber === index + 1)
          )
        }

        return parts
      })
  }

  /**
   * Gets the number of parts/chunks
   * already uploaded to S3.
   */
  async _countParts(file_id: string) {
    return this._retrieveParts(file_id).then((parts) => parts?.length ?? 0)
  }

  /**
   * Removes cached data for a given file.
   */
  _clearCache(file_id: string) {
    log(`[${file_id}] removing cached data`)
    this.cache.delete(file_id)
  }

  create(file: File) {
    return this._bucketExists()
      .then(() => {
        return this._initMultipartUpload(file)
      })
      .then(() => file)
      .catch((error) => {
        this._clearCache(file.id)
        throw error
      })
  }

  /**
   * Write to the file, starting at the provided offset
   */
  write(
    readable: http.IncomingMessage | fs.ReadStream,
    file_id: string
  ): Promise<number> {
    return this._getMetadata(file_id)
      .then((metadata) => {
        return Promise.all([metadata, this._countParts(file_id), this.getUpload(file_id)])
      })
      .then(async (results) => {
        const [metadata, part_number, initial_offset] = results
        const next_part_number = part_number + 1
        return Promise.all(
          await this._processUpload(
            metadata,
            readable,
            next_part_number,
            initial_offset.size
          )
        )
          .then(() => this.getUpload(file_id))
          .then((current_offset) => {
            if (
              Number.parseInt(metadata.file.upload_length as string, 10) ===
              current_offset.size
            ) {
              return this._finishMultipartUpload(
                metadata,
                current_offset.parts as aws.S3.Parts
              )
                .then(() => {
                  this._clearCache(file_id)
                  return current_offset.size
                })
                .catch((error) => {
                  log(`[${file_id}] failed to finish upload`, error)
                  throw error
                })
            }

            return current_offset.size
          })
          .catch((error) => {
            if (['RequestTimeout', 'NoSuchUpload'].includes(error.code)) {
              if (error.code === 'RequestTimeout') {
                log(
                  'Request "close" event was emitted, however S3 was expecting more data. Failing gracefully.'
                )
              }

              if (error.code === 'NoSuchUpload') {
                log(
                  'Request "close" event was emitted, however S3 was expecting more data. Most likely the upload is already finished/aborted. Failing gracefully.'
                )
              }

              return this.getUpload(file_id).then((current_offset) => current_offset.size)
            }

            this._clearCache(file_id)
            log(`[${file_id}] failed to write file`, error)
            throw error
          })
      })
  }

  async getUpload(id: string): Promise<File & {parts?: aws.S3.Parts; size: number}> {
    let metadata: MetadataValue | undefined
    try {
      metadata = await this._getMetadata(id)
    } catch (error) {
      log('getUpload: No file found.', error)
      throw ERRORS.FILE_NOT_FOUND
    }

    try {
      const parts = await this._retrieveParts(id)
      return {
        id,
        ...this.cache.get(id)?.file,
        // @ts-expect-error object is not possibly undefined
        size: parts && parts.length > 0 ? parts.reduce((a, b) => a + b.Size, 0) : 0,
        upload_length: metadata?.file.upload_length,
        upload_defer_length: metadata?.file.upload_defer_length,
        parts,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.code !== 'NoSuchUpload') {
        log(error)
        throw error
      }

      // When the last part of an upload is finished and the file is successfully written to S3,
      // the upload will no longer be present and requesting it will result in a 404.
      // In that case we return the upload_length as size.
      return {
        id,
        ...this.cache.get(id)?.file,
        size: Number.parseInt(metadata.file.upload_length as string, 10),
        upload_length: metadata.file.upload_length,
        upload_defer_length: metadata.file.upload_defer_length,
      }
    }
  }

  async declareUploadLength(file_id: string, upload_length: string) {
    const {file, upload_id} = await this._getMetadata(file_id)
    if (!file) {
      throw ERRORS.FILE_NOT_FOUND
    }

    file.upload_length = upload_length
    file.upload_defer_length = undefined
    this._saveMetadata(file, upload_id)
  }
}
export default S3Store
