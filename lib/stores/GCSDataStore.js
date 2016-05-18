'use strict';

const DataStore = require('./DataStore');
const gcloud = require('gcloud');

/**
 * @fileOverview
 * Store using local filesystem.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class GCSDataStore extends DataStore {
    constructor(options) {
        super(options);
        this.extensions = ['creation'];

        if (!options.bucket) {
            throw new Error('GCSDataStore must have a bucket');
        }
        this.bucket_name = options.bucket;
        this.gcs = gcloud.storage({
            projectId: options.projectId,
            keyFilename: options.keyFilename,
        });
        this.bucket = this._getBucket();
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
     * Check if the object with this id already exists in the bucket.
     * Return 201 if nothing exists and its safe path to upload into.
     * https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.32.0/storage/file?method=exists
     *
     * @param  {File} file
     * @return {Promise}]
     */
    create(file) {
        super.create(file);
        return new Promise((resolve, reject) => {
            const gcs_file = this.bucket.file(file.id);
            gcs_file.exists((error, exists) => {
                if (error || exists) {
                    return reject(error);
                }

                return resolve();
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
            const path = `https://storage.googleapis.com/${this.bucket.name}/${file_id}`;
            const file = this.bucket.file(file_id);
            const stream = file.createWriteStream();

            if (!stream) {
                return reject('unable to create write stream');
            }

            let new_offset = 0;
            req.on('data', (buffer) => {
                new_offset += buffer.length;
            });

            req.on('end', () => {
                console.log(`${new_offset} bytes written to ${path}`);
                resolve(new_offset);
            });

            stream.on('error', (e) => {
                console.log(e);
                reject(e);
            });

            return req.pipe(stream);
        });
    }

    /**
     * Make a metadata request for a file in GCS.
     * https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.32.0/storage/file?method=getMetadata
     *
     * @param  {[type]} file_id [description]
     * @return {[type]}           [description]
     */
    getOffset(file_id) {
        super.getOffset(file_id);

        return new Promise((resolve, reject) => {
            const file = this.bucket.file(file_id);
            file.getMetadata((error, metadata, apiResponse) => {
                if (error) {
                    console.log(error);
                    reject(error);
                }

                resolve(metadata);
            });
        });
    }
}

module.exports = GCSDataStore;
