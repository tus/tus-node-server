'use strict';

const assert = require('assert');
const os = require('os');

const DataStore = require('./DataStore');
const { FileStreamSplitter } = require('../models/StreamSplitter');
const aws = require('aws-sdk');
const { ERRORS, TUS_RESUMABLE } = require('../constants');

const debug = require('debug');
const fs = require('fs');
const stream = require('stream');
const log = debug('tus-node-server:stores:s3store');

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
    constructor(options) {
        super(options);

        this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length'];


        if (options.accessKeyId || options.secretAccessKey) {
            assert.ok(options.accessKeyId, '[S3Store] `accessKeyId` must be set');
            assert.ok(options.secretAccessKey, '[S3Store] `secretAccessKey` must be set');
        }
        else {
            assert.ok(options.credentials, '[S3Store] `credentials` must be set');
        }

        assert.ok(options.bucket, '[S3Store] `bucket` must be set');

        this.bucket_name = options.bucket;
        this.part_size = options.partSize || 8 * 1024 * 1024;

        // cache object to save upload data
        // avoiding multiple http calls to s3
        this.cache = {};

        delete options.partSize;

        this.client = new aws.S3(
            Object.assign(
                {},
                {
                    apiVersion: '2006-03-01',
                    region: 'eu-west-1',
                },
                options
            )
        );

        log('init');
    }

    /**
   * Check if the bucket exists in S3.
   *
   * @return {Promise}
   */
    _bucketExists() {
        return this.client
            .headBucket({ Bucket: this.bucket_name })
            .promise()
            .then((data) => {
                if (!data) {
                    throw new Error(`bucket "${this.bucket_name}" does not exist`);
                }

                log(`bucket "${this.bucket_name}" exists`);

                return data;
            })
            .catch((err) => {
                if (err.statusCode === 404) {
                    throw new Error(`[S3Store] bucket "${this.bucket_name}" does not exist`);
                }
                else {
                    throw new Error(err);
                }
            });
    }

    /**
   * Creates a multipart upload on S3 attaching any metadata to it.
   * Also, a `${file_id}.info` file is created which holds some information
   * about the upload itself like: `upload_id`, `upload_length`, etc.
   *
   * @param  {Object}          file file instance
   * @return {Promise<Object>}      upload data
   */
    _initMultipartUpload(file) {
        log(`[${file.id}] initializing multipart upload`);

        const parsedMetadata = this._parseMetadataString(file.upload_metadata);

        const upload_data = {
            Bucket: this.bucket_name,
            Key: file.id,
            Metadata: {
                tus_version: TUS_RESUMABLE,
            },
        };

        if (file.upload_length !== undefined) {
            upload_data.Metadata.upload_length = file.upload_length;
        }

        if (file.upload_defer_length !== undefined) {
            upload_data.Metadata.upload_defer_length = file.upload_defer_length;
        }

        if (file.upload_metadata !== undefined) {
            upload_data.Metadata.upload_metadata = file.upload_metadata;
        }

        if (parsedMetadata.contentType) {
            upload_data.ContentType = parsedMetadata.contentType.decoded;
        }

        if (parsedMetadata.filename) {
            upload_data.Metadata.original_name = parsedMetadata.filename.encoded;
        }

        return this.client
            .createMultipartUpload(upload_data)
            .promise()
            .then((data) => {
                log(`[${file.id}] multipart upload created (${data.UploadId})`);

                return data.UploadId;
            })
            .then((upload_id) => {
                return this._saveMetadata(file, upload_id);
            })
            .catch((err) => {
                throw err;
            });
    }

    /**
   * Saves upload metadata to a `${file_id}.info` file on S3.
   * Please note that the file is empty and the metadata is saved
   * on the S3 object's `Metadata` field, so that only a `headObject`
   * is necessary to retrieve the data.
   *
   * @param  {Object}          file      file instance
   * @param  {String}          upload_id S3 upload id
   * @return {Promise<Object>}           upload data
   */
    _saveMetadata(file, upload_id) {
        log(`[${file.id}] saving metadata`);

        const metadata = {
            file: JSON.stringify(file),
            upload_id,
            tus_version: TUS_RESUMABLE,
        };

        return this.client
            .putObject({
                Bucket: this.bucket_name,
                Key: `${file.id}.info`,
                Body: '',
                Metadata: metadata,
            })
            .promise()
            .then(() => {
                log(`[${file.id}] metadata file saved`);

                return {
                    file,
                    upload_id,
                };
            })
            .catch((err) => {
                throw err;
            });
    }

    /**
   * Retrieves upload metadata previously saved in `${file_id}.info`.
   * There's a small and simple caching mechanism to avoid multiple
   * HTTP calls to S3.
   *
   * @param  {String} file_id id of the file
   * @return {Promise<Object>}        which resolves with the metadata
   */
    _getMetadata(file_id) {
        log(`[${file_id}] retrieving metadata`);

        if (this.cache[file_id] && this.cache[file_id].file) {
            log(`[${file_id}] metadata from cache`);

            return Promise.resolve(this.cache[file_id]);
        }

        log(`[${file_id}] metadata from s3`);

        return this.client
            .headObject({
                Bucket: this.bucket_name,
                Key: `${file_id}.info`,
            })
            .promise()
            .then((data) => {
                this.cache[file_id] = Object.assign({}, data.Metadata, {
                    file: JSON.parse(data.Metadata.file),
                    // Patch for Digital Ocean: if key upload_id (AWS, standard) doesn't exist in Metadata object, fallback to upload-id (DO)
                    upload_id: data.Metadata.upload_id || data.Metadata['upload-id'],
                });

                return this.cache[file_id];
            })
            .catch((err) => {
                throw err;
            });
    }

    /**
   * Parses the Base64 encoded metadata received from the client.
   *
   * @param  {String} metadata_string tus' standard upload metadata
   * @return {Object}                 metadata as key-value pair
   */
    _parseMetadataString(metadata_string) {
        if (!metadata_string) {
            return {};
        }
        const kv_pair_list = metadata_string.split(',');

        return kv_pair_list.reduce((metadata, kv_pair) => {
            const [key, base64_value] = kv_pair.split(' ');

            metadata[key] = {
                encoded: base64_value,
                decoded: base64_value === undefined ? undefined : Buffer.from(base64_value, 'base64').toString('ascii'),
            };

            return metadata;
        }, {});
    }

    /**
   * Uploads a part/chunk to S3 from a temporary part file.
   *
   * @param  {Object}          metadata            upload metadata
   * @param  {Stream}          read_stream         incoming request read stream
   * @param  {Number}          current_part_number number of the current part/chunk
   * @return {Promise<String>}                     which resolves with the parts' etag
   */
    _uploadPart(metadata, read_stream, current_part_number) {
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
                log(`[${metadata.file.id}] finished uploading part #${current_part_number}`);

                return data.ETag;
            });
    }

    /**
   * uploads a stream to s3 using multiple parts
   *
   * @param {Object}         metadata upload metadata
   * @param {fs<ReadStream>} readStream incoming request
   * @param {Number}         currentPartNumber number of the current part/chunk
   * @param {Number}         current_size current size of uploaded data
   * @return {Promise<Number>} which resolves with the current offset
   * @memberof S3Store
   */
    _processUpload(metadata, readStream, currentPartNumber, current_size) {
        return new Promise((resolve, reject) => {
            const splitterStream = new FileStreamSplitter({
                maxChunkSize: this.part_size,
                directory: os.tmpdir(),
            });

            const promises = [];

            let pendingChunkFilepath = null;

            stream.pipeline(readStream, splitterStream, (pipelineErr) => {
                if (pipelineErr && pendingChunkFilepath !== null) {
                    fs.rm(pendingChunkFilepath, (fileRemoveErr) => {
                        if (fileRemoveErr) {
                            log(`[${metadata.file.id}] failed to remove chunk ${pendingChunkFilepath}`);
                        }
                    });
                }

                promises.push(pipelineErr ? Promise.reject(pipelineErr) : Promise.resolve());
                resolve(promises);
            });

            splitterStream.on('chunkStarted', (filepath) => {
                pendingChunkFilepath = filepath;
            });

            splitterStream.on('chunkFinished', ({ path, size }) => {
                pendingChunkFilepath = null;

                current_size += size;
                const partNumber = currentPartNumber++;

                const p = Promise.resolve()
                    .then(() => {
                        // skip chunk if it is not last and is smaller than 5MB
                        const is_last_chunk = parseInt(metadata.file.upload_length, 10) === current_size;
                        if (!is_last_chunk && size < 5 * 1024 * 1024) {
                            log(`[${metadata.file.id}] ignoring chuck smaller than 5MB`);
                            return undefined;
                        }

                        return this._uploadPart(metadata, fs.createReadStream(path), partNumber);
                    })
                    .finally(() => {
                        fs.rm(path, (err) => {
                            if (err) {
                                log(`[${metadata.file.id}] failed to remove file ${path}`, err);
                            }
                        });
                    });

                promises.push(p);
            });
        });
    }

    /**
   * Completes a multipart upload on S3.
   * This is where S3 concatenates all the uploaded parts.
   *
   * @param  {Object}          metadata upload metadata
   * @param  {Array}           parts    data of each part
   * @return {Promise<String>}          which resolves with the file location on S3
   */
    _finishMultipartUpload(metadata, parts) {
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
                        };
                    }),
                },
            })
            .promise()
            .then((result) => result.Location)
            .catch((err) => {
                throw err;
            });
    }

    /**
   * Gets the number of complete parts/chunks already uploaded to S3.
   * Retrieves only consecutive parts.
   *
   * @param  {String}          file_id            id of the file
   * @param  {String}          part_number_marker optional part number marker
   * @return {Promise<Array>}                    upload parts
   */
    _retrieveParts(file_id, part_number_marker) {
        const params = {
            Bucket: this.bucket_name,
            Key: file_id,
            UploadId: this.cache[file_id].upload_id,
        };

        if (part_number_marker) {
            params.PartNumberMarker = part_number_marker;
        }

        return this.client
            .listParts(params)
            .promise()
            .then((data) => {
                if (data.NextPartNumberMarker) {
                    return this._retrieveParts(file_id, data.NextPartNumberMarker).then((val) =>
                        [].concat(data.Parts, val)
                    );
                }
                return data.Parts;
            })
            .then((parts) => {
                // sort and filter only for call where `part_number_marker` is not set
                if (part_number_marker === undefined) {
                    parts.sort((a, b) => {
                        return a.PartNumber - b.PartNumber;
                    });

                    parts = parts.filter((value, index) => {
                        return value.PartNumber === index + 1;
                    });
                }

                return parts;
            });
    }

    /**
   * Gets the number of parts/chunks
   * already uploaded to S3.
   *
   * @param  {String}          file_id            id of the file
   * @return {Promise<Number>}                    number of parts
   */
    async _countParts(file_id) {
        return await this._retrieveParts(file_id).then((parts) => parts.length);
    }

    /**
   * Removes cached data for a given file.
   * @param  {String} file_id id of the file
   * @return {undefined}
   */
    _clearCache(file_id) {
        log(`[${file_id}] removing cached data`);
        delete this.cache[file_id];
    }

    create(file) {
        return this._bucketExists()
            .then(() => {
                return this._initMultipartUpload(file);
            })
            .then(() => file)
            .catch((err) => {
                this._clearCache(file.id);
                throw err;
            });
    }

    /**
     * Write to the file, starting at the provided offset
     *
     * @param {object} readable stream.Readable
     * @param {string} file_id Name of file
     * @param {integer} offset starting offset
     * @return {Promise}
     */
    write(readable, file_id) {
        return this._getMetadata(file_id)
            .then((metadata) => {
                return Promise.all([metadata, this._countParts(file_id), this.getOffset(file_id)]);
            })
            .then(async(results) => {
                const [metadata, part_number, initial_offset] = results;
                const next_part_number = part_number + 1;

                return Promise.all(
                    await this._processUpload(metadata, readable, next_part_number, initial_offset.size)
                )
                    .then(() => this.getOffset(file_id))
                    .then((current_offset) => {
                        if (parseInt(metadata.file.upload_length, 10) === current_offset.size) {
                            return this._finishMultipartUpload(metadata, current_offset.parts)
                                .then(() => {
                                    this._clearCache(file_id);

                                    return current_offset.size;
                                })
                                .catch((err) => {
                                    log(`[${file_id}] failed to finish upload`, err);
                                    throw err;
                                });
                        }
                        return current_offset.size;
                    })
                    .catch((err) => {
                        if (['RequestTimeout', 'NoSuchUpload'].includes(err.code)) {
                            if (err.code === 'RequestTimeout') {
                                log(
                                    'Request "close" event was emitted, however S3 was expecting more data. Failing gracefully.'
                                );
                            }

                            if (err.code === 'NoSuchUpload') {
                                log(
                                    'Request "close" event was emitted, however S3 was expecting more data. Most likely the upload is already finished/aborted. Failing gracefully.'
                                );
                            }

                            return this.getOffset(file_id).then((current_offset) => current_offset.size);
                        }

                        this._clearCache(file_id);

                        log(`[${file_id}] failed to write file`, err);
                        throw err;
                    });
            });
    }

    async getOffset(id) {
        let metadata;

        try {
            metadata = await this._getMetadata(id);
        }
        catch (err) {
            log('getOffset: No file found.', err);

            throw ERRORS.FILE_NOT_FOUND;
        }

        try {
            const parts = await this._retrieveParts(id);

            return {
                ...this.cache[id].file,
                size: parts.length > 0 ? parts.reduce((a, b) => a + b.Size, 0) : 0,
                upload_length: metadata.file.upload_length,
                upload_defer_length: metadata.file.upload_defer_length,
                parts,
            };
        }
        catch (err) {
            if (err.code !== 'NoSuchUpload') {
                log(err);
                throw err;
            }
            // When the last part of an upload is finished and the file is successfully written to S3,
            // the upload will no longer be present and requesting it will result in a 404.
            // In that case we return the upload_length as size.
            return {
                ...this.cache[id].file,
                size: metadata.file.upload_length,
                upload_length: metadata.file.upload_length,
                upload_defer_length: metadata.file.upload_defer_length,
            };
        }
    }

    async declareUploadLength(file_id, upload_length) {
        const { file, upload_id } = await this._getMetadata(file_id);

        if (!file) {
            throw ERRORS.FILE_NOT_FOUND;
        }

        file.upload_length = upload_length;
        file.upload_defer_length = undefined;

        this._saveMetadata(file, upload_id);
    }
}

module.exports = S3Store;
