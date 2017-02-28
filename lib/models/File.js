'use strict';

/**
 * @fileOverview
 * Model for File objects.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class File {
    constructor(file_id, upload_length, upload_defer_length, upload_metadata) {
        if (!file_id) {
            throw new Error('[File] constructor must be given a file_id');
        }

        if (upload_length === undefined && upload_defer_length === undefined) {
            throw new Error('[File] constructor must be given either a upload_length or upload_defer_length');
        }

        this.id = `${file_id}`;
        this.upload_length = upload_length;
        this.upload_defer_length = upload_defer_length;
        this.upload_metadata = upload_metadata;
        this.metadata = this.getMetadata();
    }

    getMetadata() {
        const all_metadata = this.upload_metadata.split(',');
        const name = 0;
        const val = 1;
        const ret = {};

        for (let i = 0; i < all_metadata.length; i++) {
            const field = all_metadata[i].split(' ');
            if (field.length > 1) {
                ret[field[name]] = Buffer.from(field[val], 'base64').toString();
            }
        }

        return ret;
    }
}

module.exports = File;
