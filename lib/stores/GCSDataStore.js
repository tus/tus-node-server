'use strict';

const DataStore = require('./DataStore');
const File = require('../models/File');
const gcloud = require('gcloud');
const googleAuth = require('google-auto-auth');
const assign = require('object-assign');
const request = require('request');
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
        this.authClient = googleAuth(this.authConfig);
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
     * Add the required authorization headers for GCS.
     *
     * @param  {Object} options
     * @return {Promise}
     */
    _makeAuthorizedRequest(options) {
        return new Promise((resolve, reject) => {
            this.authClient.authorizeRequest(options, (error, authorizedReqOpts) => {
                if (error) {
                    reject(error);
                    return;
                }

                request(authorizedReqOpts, (err, resp, body) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve(resp);
                });
            });
        });
    }

    /**
     * Get the file size from a finished upload/existing GCS object.
     *
     * @param  {String} file_id Full file name from url, which includes the upload id
     * @return {Promise}
     */
    getFileMetadata(file_id) {
        const name_without_upload_id = file_id.split('&upload_id=')[0];
        return new Promise((resolve, reject) => {
            const file = this.bucket.file(name_without_upload_id);
            file.getMetadata((error, metadata, apiResponse) => {
                if (error && error.message === 'Not Found') {
                    // it's ok if the file doesnt exist, the upload may have not
                    // been started yet.
                    return resolve({ size: 0 });
                }
                if (error) {
                    console.warn('[GCSDataStore] getFileMetadata', error);
                    return reject(error);
                }

                const data = {
                    size: metadata.size,
                    upload_length: metadata.size,
                };

                if ('metadata' in metadata) {
                    data.upload_length = metadata.metadata.upload_length || metadata.size;
                    data.upload_metadata = metadata.metadata.upload_metadata;
                }

                return resolve(data);
            });
        });
    }

    /**
     * Check if an object with this name already exists in the bucket, then create
     * the resumable upload if there isn't a collision on the file name.
     *
     * https://cloud.google.com/storage/docs/json_api/v1/how-tos/resumable-upload#start-resumable
     *
     * @param  {object} req http.incomingMessage
     * @return {Promise}
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
                    contentLength: file.upload_length,
                    metadata: {
                        upload_length: file.upload_length,
                        tus_version: TUS_RESUMABLE,
                        upload_metadata,
                        upload_defer_length,
                    },
                },
            };

            gcs_file.createResumableUpload(options, (err, url) => {
                if (err) {
                    reject(err);
                    return;
                }

                const upload_id = url.split('upload_id=').pop();
                file.id = `${file.id}&upload_id=${upload_id}`;
                resolve(file);
            });
        });
    }

    /**
     * Create a readable stream to a CGS file and pipe the file being uploaded.
     * https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.32.0/storage/file?method=createWriteStream
     *
     * @param  {[type]} req       [description]
     * @param  {[type]} file_id [description]
     * @param  {[type]} offset    [description]
     * @return {[type]}           [description]
     */
    write(req, file_id, offset) {
        return new Promise((resolve, reject) => {
            const name_without_upload_id = file_id.split('&upload_id=')[0];
            const file = this.bucket.file(name_without_upload_id);

            const options = {
                offset,
                uri: `https://www.googleapis.com/upload/storage/v1/b/${this.bucket_name}/o?uploadType=resumable&name=${file_id}`,
            };

            const stream = file.createWriteStream(options);
            if (!stream) {
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

            stream.on('error', (e) => {
                console.log(e);
                reject(ERRORS.FILE_WRITE_ERROR);
            });

            return req.pipe(stream);
        });
    }

    getRange(file_id) {
        return new Promise((resolve, reject) => {
            const url = `https://www.googleapis.com/upload/storage/v1/b/${this.bucket_name}/o?uploadType=resumable&name=${file_id}`;
            this._makeAuthorizedRequest({
                method: 'PUT',
                uri: url,
                headers: {
                    'Content-Length': 0,
                    'Content-Range': 'bytes */*',
                },
            }).then((response) => {
                if (!response.headers.range) {
                    // dont ovveride size from getFileMetadata if range fails
                    return resolve({});
                }

                const range = response.headers.range.split('-').pop();
                return resolve({ size: parseInt(range, 10) + 1 });
            })
            .catch(reject);
        });
    }

    /**
     * First attempt a range request for this file name + upload id via
     * https://cloud.google.com/storage/docs/json_api/v1/how-tos/resumable-upload#example_resuming_an_interrupted_upload
     *
     * but if the range header isn't in the response, try checking for the actual
     * object in the gcs bucket by requesting the metadata for the file name via
     * https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.32.0/storage/file?method=getMetadata
     *
     * @param  {String} file_id Full file name from url, which includes the upload id
     * @return {Promise}
     */
    getOffset(file_id) {
        super.getOffset(file_id);
        return Promise.all([
            this.getFileMetadata(file_id),
            this.getRange(file_id),
        ]).then((resolutions) => {
            return Object.assign(resolutions[0], resolutions[1]);
        });
    }
}

module.exports = GCSDataStore;
