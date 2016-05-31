'use strict';

const DataStore = require('./DataStore');
const File = require('../models/File');
const gcloud = require('gcloud');
const assign = require('object-assign');
const stream = require('stream');
const ERRORS = require('../constants').ERRORS;
const TUS_RESUMABLE = require('../constants').TUS_RESUMABLE;
const DEFAULT_CONFIG = {
    scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
};


/**
 * @fileOverview
 * Store using local filesystem.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class GCSDataStore extends DataStore {
    constructor(options) {
        super(options);
        this.extensions = ['creation', 'creation-defer-length'];

        if (!options.bucket) {
            throw new Error('GCSDataStore must have a bucket');
        }
        this.bucket_name = options.bucket;
        this.gcs = gcloud.storage({
            projectId: options.projectId,
            keyFilename: options.keyFilename,
        });
        this.bucket = this._getBucket();

        this.authConfig = assign(DEFAULT_CONFIG, {
            keyFilename: options.keyFilename,
        });
    }

    /**
     * Check the bucket exists in GCS.
     *
     * @return {[type]} [description]
     */
    _getBucket() {
        const bucket = this.gcs.bucket(this.bucket_name);
        bucket.exists((error, exists) => {
            if (error) {
                console.warn(error);
                throw new Error(`[GCSDataStore] _getBucket: ${error.message}`);
            }

            if (!exists) {
                throw new Error(`[GCSDataStore] _getBucket: ${this.bucket_name} bucket does not exist`);
            }

        });

        return bucket;
    }

    /**
     * [create description]
     * @param  {[type]} req [description]
     * @return {[type]}     [description]
     */
    create(req) {
        return new Promise((resolve, reject) => {
            const upload_length = req.headers['upload-length'];
            const upload_defer_length = req.headers['upload-defer-length'];
            const upload_metadata = req.headers['upload-metadata'];

            if (upload_length === undefined && upload_defer_length === undefined) {
                reject(ERRORS.INVALID_LENGTH);
                return;
            }

            let file_id;
            try {
                file_id = this.generateFileName(req);
            }
            catch (generateError) {
                console.warn('[FileStore] create: check your namingFunction. Error', generateError);
                reject(ERRORS.FILE_WRITE_ERROR);
                return;
            }

            const file = new File(file_id, upload_length, upload_defer_length, upload_metadata);
            const gcs_file = this.bucket.file(file.id);
            const options = {
                metadata: {
                    metadata: {
                        upload_length: file.upload_length,
                        tus_version: TUS_RESUMABLE,
                        upload_metadata,
                        upload_defer_length,
                    },
                },
            };

            const fake_stream = new stream.PassThrough();
            fake_stream.end();
            fake_stream.pipe(gcs_file.createWriteStream(options))
            .on('error', reject)
            .on('finish', () => {
                resolve(file);
            });
        });
    }

    /**
     * [write description]
     * @param  {[type]} req     [description]
     * @param  {[type]} file_id [description]
     * @param  {[type]} offset  [description]
     * @return {[type]}         [description]
     */
    write(req, file_id, offset) {
        return new Promise((resolve, reject) => {
            const file = this.bucket.file(file_id);

            const options = {
                offset,
            };

            const write_stream = file.createWriteStream(options);
            if (!write_stream) {
                return reject(ERRORS.FILE_WRITE_ERROR);
            }

            let new_offset = 0;
            req.on('data', (buffer) => {
                new_offset += buffer.length;
            });

            req.on('end', () => {
                console.log(`${new_offset} bytes written`);
                resolve(new_offset);
            });

            write_stream.on('error', (e) => {
                console.log(e);
                reject(ERRORS.FILE_WRITE_ERROR);
            });

            return req.pipe(write_stream);
        });
    }

    /**
     * [getOffset description]
     * @param  {[type]} file_id [description]
     * @return {[type]}         [description]
     */
    getOffset(file_id) {
        return new Promise((resolve, reject) => {
            const file = this.bucket.file(file_id);
            file.getMetadata((error, metadata, apiResponse) => {
                if (error && error.message === 'Not Found') {
                    return reject(ERRORS.FILE_NOT_FOUND);
                }

                if (error) {
                    console.warn('[GCSDataStore] getFileMetadata', error);
                    return reject(error);
                }
                const data = {
                    size: parseInt(metadata.size, 10),
                };

                if (!('metadata' in metadata)) {
                    return resolve(data);
                }

                if (metadata.metadata.upload_length) {
                    data.upload_length = parseInt(metadata.metadata.upload_length, 10);
                }

                if (metadata.metadata.upload_defer_length) {
                    data.upload_defer_length = parseInt(metadata.metadata.upload_defer_length, 10);
                }

                if (metadata.metadata.upload_metadata) {
                    data.upload_metadata = metadata.metadata.upload_metadata;
                }

                return resolve(data);
            });
        });
    }
}

module.exports = GCSDataStore;
