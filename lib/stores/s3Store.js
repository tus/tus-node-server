'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const mkdirp = require('mkdirp');
const debug = require('debug')('s3:tus:store');
const File = require('../models/File');
const DataStore = require('./DataStore');
const aws = require('aws-sdk');
const ERRORS = require('../constants').ERRORS;
const EVENTS = require('../constants').EVENTS;
const TUS_RESUMABLE = require('../constants').TUS_RESUMABLE;

/**
 * TODO
 * - support smaller file sizes
 *     - if file is smaller than min_part_size, upload with `putObject`
 * - add support for `chunkSize: Infinity` (stream splitter?)
 * - `listParts` supporting pagination if upload has more than 1000 parts
 * - improve error handling
 * - tests :)
 * - support other extensions like termination
 */

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
//
// When receiving a PATCH request, its body will be temporarily stored on disk.
// This requirement has been made to ensure the minimum size of a single part.
// Once the part has been uploaded to S3, the temporary file will be removed immediately.
// Therefore, please ensure that the server running this storage backend
// has enough disk space available to hold these caches.

class S3Store extends DataStore {
    constructor(options) {
        super(options);

        this.extensions = ['creation', 'creation-defer-length'];

        assert.ok(options.accessKeyId, '[S3Store] `accessKeyId` must be set');
        assert.ok(options.secretAccessKey, '[S3Store] `secretAccessKey` must be set');
        assert.ok(options.bucket, '[S3Store] `bucket` must be set');

        this.tmp_dir_prefix = options.tmpDirPrefix || 'tus-s3-store';
        this.bucket_name = options.bucket;
        this.part_size = options.partSize || 8 * 1024 * 1024;

        // cache object to save upload data
        // avoiding multiple http calls to s3
        this.cache = {};

        delete options.partSize;
        delete options.tmpDirPrefix;

        this.client = new aws.S3(Object.assign({}, {
            apiVersion: '2006-03-01',
            region: 'eu-west-1',
        }, options));

        debug('init');
    }

    /**
     * Check if the bucket exists in S3.
     *
     * @return {Promise}
     */
    _bucketExists() {
        return this.client.headBucket({ Bucket: this.bucket_name })
            .promise()
            .then((data) => {
                if (!data) {
                    throw new Error(`bucket "${this.bucket_name}" does not exist`);
                }

                debug(`bucket "${this.bucket_name}" exists`);

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
     * Gets the path of the temp dir used to save temp files.
     *
     * @return {String} temp dir path
     */
    _getTempDirPath() {
        return path.join(os.tmpdir(), this.tmp_dir_prefix);
    }

    /**
     * Makes sure the temp dir is available (creates one if non-existent).
     *
     * @return {Promise<String>} temp dir path
     */
    _ensureTempDir() {
        return new Promise((resolve, reject) => {
            const tmp_dir_path = this._getTempDirPath();

            mkdirp(tmp_dir_path, (err) => {
                if (err) {
                    return reject(err);
                }

                debug(`directory "${tmp_dir_path}" is ready`);

                return resolve(tmp_dir_path);
            });
        });
    }

    /**
     * Initializes the S3 data store by checking
     * if the specified bucket exists and making sure
     * the temp dir is created.
     *
     * @return {Promise}
     */
    _init() {
        return Promise.all([
            this._bucketExists(),
            this._ensureTempDir(),
        ]);
    }

    /**
     * Gets the full path of a temporary file.
     *
     * @param  {String} file_id     id of the file
     * @param  {Number} part_number number of the current part/chunk
     * @return {Object}             file path
     */
    _getTempFilePath(file_id, part_number) {
        return path.join(this._getTempDirPath(), `${file_id}__${part_number}`);
    }

    /**
     * Gets an object with some properties/methods
     * used to manipulate a given temp file.
     *
     * @param  {String} file_id     id of the file
     * @param  {Number} part_number number of the current part/chunk
     * @return {Object}             file path and read/write streams
     */
    _getTempFile(file_id, part_number) {
        const tmp_file_path = this._getTempFilePath(file_id, part_number);

        return {
            path: tmp_file_path,
            createWriteStream: () => fs.createWriteStream(tmp_file_path),
            createReadStream: () => fs.createReadStream(tmp_file_path),
        };
    }

    /**
     * Removes a given temporary file from disk.
     *
     * @param  {String} file_id     id of the file
     * @param  {Number} part_number number of the current part/chunk
     * @return {Promise}
     */
    _removeTempFile(file_id, part_number) {
        return new Promise((resolve, reject) => {
            const tmp_file_path = this._getTempFilePath(file_id, part_number);

            debug(`[${file_id}] removing temporary part file #${part_number}`);

            fs.unlink(tmp_file_path, (err) => {
                if (err) {
                    return reject(err);
                }

                debug(`[${file_id}] removed temporary part file #${part_number}`);

                return resolve();
            });
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
        debug(`[${file.id}] initializing multipart upload`);

        const parsedMetadata = this._parseMetadataString(file.upload_metadata);

        const upload_data = {
            Bucket: this.bucket_name,
            Key: file.id,
            Metadata: {
                upload_length: file.upload_length,
                tus_version: TUS_RESUMABLE,
                upload_metadata: file.upload_metadata,
                // upload_defer_length: upload_defer_length,
            },
        };

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
                debug(`[${file.id}] multipart upload created (${data.UploadId})`);

                return data.UploadId;
            })
            .then((upload_id) => this._saveMetadata(file, upload_id))
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
        debug(`[${file.id}] saving metadata`);

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
                debug(`[${file.id}] metadata file saved`);

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
        debug(`[${file_id}] retrieving metadata`);

        if (this.cache[file_id] && this.cache[file_id].file) {
            debug(`[${file_id}] metadata from cache`);

            return Promise.resolve(this.cache[file_id]);
        }

        debug(`[${file_id}] metadata from s3`);

        return this.client
            .headObject({
                Bucket: this.bucket_name,
                Key: `${file_id}.info`,
            })
            .promise()
            .then((data) => {
                this.cache[file_id] = Object.assign({}, data.Metadata, {
                    file: JSON.parse(data.Metadata.file),
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
        const kv_pair_list = metadata_string.split(',');

        return kv_pair_list.reduce((metadata, kv_pair) => {
            const [key, base64_value] = kv_pair.split(' ');

            metadata[key] = {
                encoded: base64_value,
                decoded: Buffer.from(base64_value, 'base64').toString('ascii'),
            };

            return metadata;
        }, {});
    }

    /**
     * Uploads a part/chunk to S3 from a temporary part file.
     *
     * @param  {Object}          metadata            upload metadata
     * @param  {Object}          temp_file           with path and /read/write stream
     * @param  {Number}          current_part_number number of the current part/chunk
     * @return {Promise<String>}                     which resolves with the parts' etag
     */
    _uploadPart(metadata, temp_file, current_part_number) {
        const readStream = temp_file.createReadStream();

        // no-op'ing as `readStream` errors will be thrown in the
        // promise below when `this.client.uploadPart` tries
        // to read from it
        readStream.on('error', () => {});

        return this.client
            .uploadPart({
                Bucket: this.bucket_name,
                Key: metadata.file.id,
                UploadId: metadata.upload_id,
                PartNumber: current_part_number,
                Body: readStream,
            })
            .promise()
            .then((data) => {
                debug(`[${metadata.file.id}] finished uploading part #${current_part_number}`);

                return data.ETag;
            })
            .catch((err) => {
                throw err;
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
     * Gets the number of parts/chunks
     * already uploaded to S3.
     *
     * @param  {String}          file_id            id of the file
     * @param  {String}          part_number_marker optional part number marker
     * @return {Promise<Number>}                    number of parts
     */
    _countParts(file_id, part_number_marker) {
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
                    return this._countParts(file_id, data.NextPartNumberMarker)
                        .then((val) => data.Parts.length + val);
                }
                return data.Parts.length;
            });
    }

    /**
     * Removes cached data for a given file.
     * @param  {String} file_id id of the file
     * @return {undefined}
     */
    _clearCache(file_id) {
        debug(`[${file_id}] removing cached data`);
        delete this.cache[file_id];
    }

    create(req) {
        const upload_length = req.headers['upload-length'];
        const upload_defer_length = req.headers['upload-defer-length'];
        const upload_metadata = req.headers['upload-metadata'];

        if (upload_length === undefined && upload_defer_length === undefined) {
            throw new Error(ERRORS.INVALID_LENGTH);
        }

        let file_id;

        try {
            file_id = this.generateFileName(req);
        }
        catch (err) {
            console.warn('[S3Store] create: check your `namingFunction`. Error', err);
            throw new Error(ERRORS.FILE_WRITE_ERROR);
        }

        const file = new File(file_id, upload_length, upload_defer_length, upload_metadata);

        return this._init()
            .then(() => this._initMultipartUpload(file))
            .then((data) => {
                this.emit(EVENTS.EVENT_FILE_CREATED, data);

                return data.file;
            })
            .catch((err) => {
                this._clearCache(file_id);
                throw err;
            });
    }

    write(req, file_id, offset) {
        return new Promise((resolve, reject) => {
            Promise
                .all([
                    this._countParts(file_id),
                    this._getMetadata(file_id),
                ])
                .then((results) => {
                    const [part_number, metadata] = results;
                    const current_part_number = part_number + 1;
                    const temp_file = this._getTempFile(file_id, current_part_number);
                    const temp_file_stream = temp_file.createWriteStream();

                    temp_file_stream.on('close', () => {
                        debug(`[${file_id}] finished writing part #${current_part_number}`);

                        this._uploadPart(metadata, temp_file, current_part_number)
                            .then(() => this.getOffset(file_id, true))
                            .then((current_offset) => {
                                this._removeTempFile(file_id, current_part_number);

                                if (parseInt(metadata.file.upload_length, 10) === current_offset.size) {
                                    return this._finishMultipartUpload(metadata, current_offset.parts)
                                        .then((location) => {
                                            debug(`[${file_id}] finished uploading: ${location}`);

                                            this.emit(EVENTS.EVENT_UPLOAD_COMPLETE, {
                                                file: Object.assign({}, metadata.file, { location }),
                                            });

                                            this._clearCache(file_id);

                                            return resolve(current_offset.size);
                                        })
                                        .catch((err) => {
                                            console.error(err);
                                            this._clearCache(file_id);
                                            reject(err);
                                        });
                                }

                                return resolve(current_offset.size);
                            })
                            .catch((err) => {
                                if (err.code === 'ENOENT') {
                                    console.warn(`[S3Store] unable to upload ${temp_file.path} as its`
                                        + ' Stream is not readable. Asking client to upload it again...');
                                    return resolve(offset);
                                }

                                console.error(err);
                                return reject(err);
                            });
                    });

                    return req.pipe(temp_file_stream);
                })
                .catch(reject);
        });
    }

    getOffset(file_id, with_parts = false) {
        return new Promise((resolve, reject) => {
            this._getMetadata(file_id)
                .then((metadata) => {
                    return this.client
                        .listParts({
                            Bucket: this.bucket_name,
                            Key: file_id,
                            UploadId: metadata.upload_id,
                        })
                        .promise()
                        .then((data) => {
                            return {
                                parts: data.Parts,
                                metadata,
                            };
                        })
                        .catch((err) => {
                            throw err;
                        });
                })
                .then((data) => {
                    // if no parts are found, offset is 0
                    if (data.parts.length === 0) {
                        return resolve({
                            size: 0,
                            upload_length: data.metadata.file.upload_length,
                        });
                    }

                    const offset = data.parts.reduce((a, b) => {
                        a += parseInt(b.Size, 10);

                        return a;
                    }, 0);

                    const output = Object.assign({}, this.cache[file_id].file, {
                        size: offset,
                    });

                    return resolve(!with_parts
                        ? output
                        : Object.assign({}, output, { parts: data.parts }));
                })
                .catch((err) => {
                    if (['NotFound', 'NoSuchUpload'].includes(err.code)) {
                        console.error(err);
                        console.warn('[S3Store] getOffset: No file found.');

                        return reject(ERRORS.FILE_NOT_FOUND);
                    }

                    throw err;
                });
        });
    }
}

module.exports = S3Store;
