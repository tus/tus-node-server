'use strict';

/**
 * @fileOverview
 * Model for File objects.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class File {
    constructor(file_name, upload_length, upload_defer_length, upload_metadata) {
        if (!file_name) {
            throw new Error('[File] constructor must be given a file_name');
        }

        if (upload_length === undefined && upload_defer_length === undefined) {
            throw new Error('[File] constructor must be given either a upload_length or upload_defer_length');
        }

        this.id = `${file_name}`;
        this.upload_length = upload_length;
        this.upload_defer_length = upload_defer_length;
        this.upload_metadata = upload_metadata;
    }
}

module.exports = File;
