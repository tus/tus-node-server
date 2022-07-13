'use strict';

const DataStore = require('./DataStore');
const { Storage } = require('@google-cloud/storage');
const stream = require('stream');
const { EVENTS, ERRORS, TUS_RESUMABLE } = require('../constants');
const DEFAULT_CONFIG = {
    scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
};
const debug = require('debug');
const log = debug('tus-node-server:stores:gcsstore');

/**
 * @fileOverview
 * Store using local filesystem.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class GCSDataStore extends DataStore {
    constructor(options) {
        super(options);
        this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length'];

        if (!options.bucket) {
            throw new Error('GCSDataStore must have a bucket');
        }
        this.bucket_name = options.bucket;
        this.gcs = new Storage({
            projectId: options.projectId,
            keyFilename: options.keyFilename,
        });
        this.bucket = this._getBucket();

        this.authConfig = Object.assign(DEFAULT_CONFIG, {
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
                log(error);
                throw new Error(`[GCSDataStore] _getBucket: ${error.message}`);
            }

            if (!exists) {
                throw new Error(`[GCSDataStore] _getBucket: ${this.bucket_name} bucket does not exist`);
            }

        });

        return bucket;
    }

    /**
     * Create an empty file in GCS to store the metatdata.
     *
     * @param  {File} file
     * @return {Promise}
     */
    create(file) {
        return new Promise((resolve, reject) => {
            if (!file.id) {
                reject(ERRORS.FILE_NOT_FOUND);
                return;
            }

            const gcs_file = this.bucket.file(file.id);
            const options = {
                metadata: {
                    metadata: {
                        tus_version: TUS_RESUMABLE,
                        upload_length: file.upload_length,
                        upload_metadata: file.upload_metadata,
                        upload_defer_length: file.upload_defer_length,
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

    /** Get file from GCS storage
     *
     * @param {string} file_id    Name of the file
     *
     * @return {stream.Readable}
     */
    read(file_id) {
        return this.bucket.file(file_id).createReadStream();
    }

    /**
     * Get the file metatata from the object in GCS, then upload a new version
     * passing through the metadata to the new version.
     *
     * @param  {object} req         http.incomingMessage
     * @param  {string} file_id     Name of file
     * @param  {integer} offset     starting offset
     * @return {Promise}
     */
    write(req, file_id, offset) {
        // GCS Doesn't persist metadata within versions,
        // get that metadata first
        return this.getOffset(file_id)
            .then((data) => {
                return new Promise((resolve, reject) => {
                    const file = this.bucket.file(file_id);

                    const destination = data.size === 0 ? file : this.bucket.file(`${file_id}_patch`);

                    const options = {
                        offset,
                        metadata: {
                            metadata: {
                                upload_length: data.upload_length,
                                tus_version: TUS_RESUMABLE,
                                upload_metadata: data.upload_metadata,
                                upload_defer_length: data.upload_defer_length,
                            },
                        },
                    };

                    const write_stream = destination.createWriteStream(options);
                    if (!write_stream || req.destroyed) {
                        reject(ERRORS.FILE_WRITE_ERROR);
                        return;
                    }

                    let new_offset = data.size;
                    req.on('data', (buffer) => {
                        new_offset += buffer.length;
                    });

                    stream.pipeline(req, write_stream, async(e) => {
                        if (e) {
                            log(e);
                            try {
                                await destination.delete({ ignoreNotFound: true });
                            }
                            finally {
                                reject(ERRORS.FILE_WRITE_ERROR);
                            }
                        }
                        else {
                            log(`${new_offset} bytes written`);

                            try {
                                if (file !== destination) {
                                    await this.bucket.combine([file, destination], file);
                                    await Promise.all([file.setMetadata(options.metadata), destination.delete({ ignoreNotFound: true })]);
                                }

                                if (data.upload_length === new_offset) {
                                    this.emit(EVENTS.EVENT_UPLOAD_COMPLETE, { file });
                                }

                                resolve(new_offset);
                            }
                            catch (err) {
                                log(err);
                                reject(ERRORS.FILE_WRITE_ERROR);
                            }
                        }
                    });
                });
            });
    }

    /**
     * Get file metadata from the GCS Object.
     *
     * @param  {string} file_id     name of the file
     * @return {object}
     */
    getOffset(file_id) {
        return new Promise((resolve, reject) => {
            const file = this.bucket.file(file_id);
            file.getMetadata((error, metadata, apiResponse) => {
                if (error && error.code === 404) {
                    return reject(ERRORS.FILE_NOT_FOUND);
                }

                if (error) {
                    log('[GCSDataStore] getFileMetadata', error);
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
