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
        this.extensions = ['creation', 'expiration'];

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
        return bucket.exists((error, exists) => {
            if (error) {
                console.warn(error);
                throw new Error(`[GCSDataStore] _getBucket: ${error.message}`);
            }

            if (!exists) {
                throw new Error(`[GCSDataStore] _getBucket: ${this.bucket_name} bucket does not exist`);
            }
            return bucket;
        });
    }

    create(file) {
        super.create(file);
    }

    write(req) {
        super.write(req);
    }

    getOffset(file_name) {
        super.getOffset(file_name);
    }
}

module.exports = GCSDataStore;
