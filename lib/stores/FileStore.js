'use strict';

const DataStore = require('./DataStore');
const fs = require('fs');
const MASK = '0777';
const IGNORED_MKDIR_ERROR = 'EEXIST';

/**
 * @fileOverview
 * Store using local filesystem.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class FileStore extends DataStore {
    constructor(options) {
        super(options);

        this.directory = options.directory || options.path.replace(/^\//, '');

        this.extensions = ['creation', 'expiration'];
        this._checkOrCreateDirectory();
    }

    /**
     *  Ensure the directory exists.
     */
    _checkOrCreateDirectory() {
        fs.mkdir(this.directory, MASK, (error) => {
            if (error && error.code !== IGNORED_MKDIR_ERROR) {
                throw error;
            }
        });
    }

    /**
     * Create an empty file.
     *
     * @param  {File} file
     * @return {Promise}
     */
    create(file) {
        super.create(file);
        return new Promise((resolve, reject) => {
            fs.open(`${this.directory}/${file.id}`, 'w', (err, fd) => {
                if (err) {
                    console.log(err);
                    return reject(err);
                }

                return fs.close(fd, (exception) => {
                    if (exception) {
                        return reject(exception);
                    }

                    return resolve();
                });
            });
        });
    }

    write(req, file_name, offset) {
        return new Promise((resolve, reject) => {
            const path = `${this.directory}/${file_name}`;
            const options = {
                flags: 'r+',
                start: offset,
            };

            const stream = fs.createWriteStream(path, options);

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
     * Return file stats, if they exits
     *
     * @param  {string} file_name name of the file
     * @return {object}           fs stats
     */
    getOffset(file_name) {
        return new Promise((resolve, reject) => {
            fs.stat(`${this.directory}/${file_name}`, (error, stats) => {
                if (error) {
                    console.log(error);
                    reject(error);
                }

                resolve(stats);
            });
        });
    }
}

module.exports = FileStore;
