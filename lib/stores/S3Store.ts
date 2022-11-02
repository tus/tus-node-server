// TODO: refactor to fs/promises and S3 with async/await
import {strict as assert} from 'node:assert'
import os from 'node:os'
import fs from 'node:fs'
import stream from 'node:stream'
import http from 'node:http'

import aws from 'aws-sdk'
import debug from 'debug'

import DataStore from './DataStore'
import FileStreamSplitter from '../models/StreamSplitter'
import File from '../models/File'
import {ERRORS, TUS_RESUMABLE} from '../constants'

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
export default class S3Store extends DataStore {
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
    const parsedMetadata = this._parseMetadataString(file.metadata)
    type Data = {
      Bucket: string
      Key: string
      ContentType?: string
      Metadata: {
        tus_version: string
        original_name?: string
        size?: string
        isSizeDeferred?: string
        offset: string
        metadata?: string
      }
    }
    const upload_data: Data = {
      Bucket: this.bucket_name,
      Key: file.id,
      Metadata: {
        tus_version: TUS_RESUMABLE,
        offset: file.offset.toString(),
      },
    }
    if (file.size) {
      upload_data.Metadata.size = file.size.toString()
      upload_data.Metadata.isSizeDeferred = 'false'
    } else {
      upload_data.Metadata.isSizeDeferred = 'true'
    }

    if (file.metadata !== undefined) {
      upload_data.Metadata.metadata = file.metadata
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
  _getMetadata(id: string): Promise<MetadataValue> {
    log(`[${id}] retrieving metadata`)
    const cached = this.cache.get(id)
    if (cached?.file) {
      log(`[${id}] metadata from cache`)
      return Promise.resolve(cached)
    }

    log(`[${id}] metadata from s3`)
    return this.client
      .headObject({
        Bucket: this.bucket_name,
        Key: `${id}.info`,
      })
      .promise()
      .then(({Metadata}) => {
        const file = JSON.parse(Metadata?.file as string)
        this.cache.set(id, {
          ...Metadata,
          file: new File({
            id,
            size: file.size ? Number.parseInt(file.size, 10) : undefined,
            offset: Number.parseInt(file.offset, 10),
            metadata: file.metadata,
          }),
          // Patch for Digital Ocean: if key upload_id (AWS, standard) doesn't exist in Metadata object, fallback to upload-id (DO)
          upload_id:
            (Metadata?.upload_id as string) || (Metadata?.['upload-id'] as string),
        })
        return this.cache.get(id) as MetadataValue
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
            const is_last_chunk = metadata.file.size === current_size
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
    id: string,
    part_number_marker?: number
  ): Promise<aws.S3.Parts | undefined> {
    const params: aws.S3.ListPartsRequest = {
      Bucket: this.bucket_name,
      Key: id,
      UploadId: this.cache.get(id)?.upload_id as string,
    }
    if (part_number_marker) {
      params.PartNumberMarker = part_number_marker
    }

    return this.client
      .listParts(params)
      .promise()
      .then((data) => {
        if (data.NextPartNumberMarker) {
          return this._retrieveParts(id, data.NextPartNumberMarker).then((parts) => {
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
        const [metadata, part_number, upload] = results
        const next_part_number = part_number + 1
        return Promise.all(
          await this._processUpload(metadata, readable, next_part_number, upload.offset)
        )
          .then(() => this.getUpload(file_id))
          .then((upload) => {
            if (metadata.file.size === upload.offset) {
              return this._finishMultipartUpload(metadata, upload.parts as aws.S3.Parts)
                .then(() => {
                  this._clearCache(file_id)
                  return upload.offset
                })
                .catch((error) => {
                  log(`[${file_id}] failed to finish upload`, error)
                  throw error
                })
            }

            return upload.offset
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

              return this.getUpload(file_id).then(
                (current_offset) => current_offset.offset
              )
            }

            this._clearCache(file_id)
            log(`[${file_id}] failed to write file`, error)
            throw error
          })
      })
  }

  // TODO: getUpload should only return file
  async getUpload(id: string): Promise<File & {parts?: aws.S3.Parts}> {
    let metadata: MetadataValue
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
        offset: parts && parts.length > 0 ? parts.reduce((a, b) => a + b.Size, 0) : 0,
        size: metadata.file.size,
        sizeIsDeferred: metadata.file.sizeIsDeferred,
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
        offset: metadata.file.offset,
        size: metadata.file.size,
        sizeIsDeferred: metadata.file.sizeIsDeferred,
      }
    }
  }

  async declareUploadLength(file_id: string, upload_length: number) {
    const {file, upload_id} = await this._getMetadata(file_id)
    if (!file) {
      throw ERRORS.FILE_NOT_FOUND
    }

    file.size = upload_length

    this._saveMetadata(file, upload_id)
  }
}
