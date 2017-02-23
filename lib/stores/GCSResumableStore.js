'use strict';

const DataStore = require('./DataStore');
const File = require('../models/File');
const ConfigStore = require('configstore');
const pkg = require('../../package.json');
const gcloud = require('google-cloud');
const assign = require('object-assign');
const googleAuth = require('google-auto-auth');
const Resolute = require('resolutejs');
const request = require('request').defaults({
    json: true,
    pool: {
        maxSockets: Infinity,
    },
});

const ERRORS = require('../constants').ERRORS;
const EVENTS = require('../constants').EVENTS;
const TUS_RESUMABLE = require('../constants').TUS_RESUMABLE;
const DEFAULT_CONFIG = {
    scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
};

const BASE_URI = 'https://www.googleapis.com/upload/storage/v1/b';
const TERMINATED_UPLOAD_STATUS_CODE = 410;
const RESUMABLE_INCOMPLETE_STATUS_CODE = 308;


/**
 * @fileOverview
 * Store using local filesystem.
 *
 */

class GCSResumableStore extends DataStore {
    constructor(options) {
        super(options);
        this.extensions = ['creation', 'creation-defer-length'];

        if (!options.bucket) {
            throw new Error('GCSResumableStore must have a bucket');
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


        this.configStore = new ConfigStore(`${pkg.name}-${pkg.version}`);
        console.log('[GCSResumableStore] constructor');
    }

    /**
     * Create an empty file in GCS to store the metatdata.
     *
     * @param  {object} req http.incomingMessage
     * @param  {File} file
     * @return {Promise}
     */
    create(req) {
        return new Promise((resolve, reject) => {
            const self = this;
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
                console.warn('[GCSResumableStore] create: check your namingFunction. Error', generateError);
                reject(ERRORS.FILE_WRITE_ERROR);
                return;
            }

            const file = new File(file_id, upload_length, upload_defer_length, upload_metadata);
            file.total_offset = 0;

            const reqOpts = {
                method: 'POST',
                uri: [BASE_URI, this.bucket_name, 'o'].join('/'),
                qs: {
                    name: file_id,
                    uploadType: 'resumable',
                },
                json: {
                    'metadata': file.getMetadata(),
                },
                headers: {},
            };

            console.log(`making request against ${reqOpts.uri}`);

            if (upload_length) {
                reqOpts.headers['X-Upload-Content-Length'] = upload_length;
            }

            if (file.getMetadata().contentType) {
                reqOpts.headers['X-Upload-Content-Type'] = file.getMetadata().contentType;
            }

            self._makeRequest(reqOpts, (err, resp) => {
                if (err) {
                    return reject(err);
                }
                const uri = resp.headers.location;
                file.uploadUrl = uri;

                self.configStore.set(file_id, file);

                console.log(`[GCSResumableStore] file created ${uri}`);

                self.emit(EVENTS.EVENT_FILE_CREATED, { file });
                return resolve(file);
            });

        });
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
        const self = this;
        return new Promise((resolve, reject) => {
            const file = self.configStore.get(file_id);

            const reqOpts = {
                method: 'PUT',
                uri: file.uploadUrl,
                headers: {
                    'Content-Range': `bytes  ${offset}-*/${file.upload_length}`,
                },
            };

            self._getRequestStream(reqOpts, (write_stream) => {
                if (!write_stream) {
                    return reject(ERRORS.FILE_WRITE_ERROR);
                }

                let new_offset = 0;
                req.on('data', (buffer) => {
                    new_offset += buffer.length;
                });

                req.on('end', () => {
                    console.info(`[GCSResumableStore] ${new_offset} bytes written to ${file_id}`);

                    offset += new_offset;
                    self.configStore.set(file_id, file);

                    if (parseInt(file.upload_length, 10) === offset) {
                        self._deleteConfig(file_id);
                        this.emit(EVENTS.EVENT_UPLOAD_COMPLETE, { file });
                        resolve(offset);
                    }
                    else {
                        const getOffsetExpected = () => {
                            return self.getOffset(file_id, offset);
                        };

                        const resolute_options = {
                            operation: getOffsetExpected,
                            // Maximum number of times to attempt
                            maxRetry: 5,
                            // Delay between retries in milliseconds
                            delay: 1000,
                            exponentialBackoff: true,
                        };
                        const resolute_callback = function(retryCount, delay) {
                            console.log(`Retrying GCS getOffset call ${retryCount} in ${delay} ms`);
                        };
                        const retry = new Resolute(resolute_options, resolute_callback);

                        retry.run(getOffsetExpected)
                            .then(() => {
                                return resolve(offset);
                            }).catch((err) => {
                                console.log(`failed after trying: ${retry.maxRetry}  times, with error: ${err}`);
                                reject(ERRORS.FILE_WRITE_ERROR);
                            });
                    }

                });

                write_stream.on('error', (e) => {
                    console.log(e);
                    reject(ERRORS.FILE_WRITE_ERROR);
                });

                return req.pipe(write_stream);
            });


        });
    }


    /**
     * Get resumable file state and metadata from the GCS Object.
     *
     * @param  {string} file_id         name of the file
     * @param  {number} expectedSize    optional: size in bytes expected otherwise throw an error
     * @return {object}
     */
    getOffset(file_id, expectedSize) {
        const self = this;
        return new Promise((resolve, reject) => {

            const file = self.configStore.get(file_id);

            if (file && file.uploadUrl) {

                self._makeRequest({
                    method: 'PUT',
                    uri: file.uploadUrl,
                    headers: {
                        'Content-Length': 0,
                        'Content-Range': 'bytes */*',
                    },
                }, (err, resp) => {
                    if (err) {
                        // this resumable upload is unrecoverable (bad data or service error).
                        //  - https://github.com/stephenplusplus/gcs-resumable-upload/issues/15
                        //  - https://github.com/stephenplusplus/gcs-resumable-upload/pull/16#discussion_r80363774
                        if (resp && resp.statusCode === TERMINATED_UPLOAD_STATUS_CODE) {
                            reject(ERRORS.FILE_WRITE_ERROR);
                        }

                        self.destroy(err);
                    }

                    if (resp.statusCode === RESUMABLE_INCOMPLETE_STATUS_CODE) {
                        if (resp.headers.range) {
                            const fileSize = parseInt(resp.headers.range.split('-')[1], 10) + 1;

                            if (expectedSize && expectedSize !== fileSize) {
                                reject(Object.assign({ size: fileSize }, file));
                            }

                            resolve(Object.assign({ size: fileSize }, file));
                        }
                    }

                    if (expectedSize && expectedSize !== 0) {
                        reject(Object.assign({ size: 0 }, file));
                    }

                    resolve(Object.assign({ size: 0 }, file));
                });
            }
            else {
                console.info(`[GCSResumableStore] getOffset: No file found at ${file_id}`);
                reject(ERRORS.FILE_NOT_FOUND);
            }
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
                throw new Error(`[GCSResumableStore] _getBucket: ${error.message}`);
            }

            if (!exists) {
                throw new Error(`[GCSResumableStore] _getBucket: ${this.bucket_name} bucket does not exist`);
            }

        });

        return bucket;
    }

    _wrapError(message, err) {
        return new Error([message, err.message].join('\n'));
    }

    _makeRequest(reqOpts, callback) {
        const self = this;
        this.authClient.authorizeRequest(reqOpts, (err, authorizedReqOpts) => {
            if (err) {
                callback(self._wrapError('Could not authenticate request', err));
            }

            request(authorizedReqOpts, (e, resp, body) => {
                if (err) {
                    callback(e, resp);
                }

                if (body && body.error) {
                    callback(body.error, resp);
                }

                const nonSuccess = Math.floor(resp.statusCode / 100) !== 2; // 200-299 status code
                if (nonSuccess && resp.statusCode !== RESUMABLE_INCOMPLETE_STATUS_CODE) {
                    console.log(`status code returned was ${resp.statusCode}`);
                    callback(new Error(body));
                }

                callback(null, resp, body);
            });

            return;
        });
    }

    _getRequestStream(reqOpts, callback) {
        const self = this;

        this.authClient.authorizeRequest(reqOpts, (err, authorizedReqOpts) => {
            if (err) {
                self.destroy(self._wrapError('Could not authenticate request', err));
            }

            const requestStream = request(authorizedReqOpts);

            callback(requestStream);
        });
    }

    _get(file_id, prop) {
        const store = this.configStore.get(file_id);
        return store && store[prop];
    }

    _set(file_id, props) {
        this.configStore.set(file_id, props);
    }

    _deleteConfig(file_id) {
        this.configStore.del(file_id);
    }


}


module.exports = GCSResumableStore;
