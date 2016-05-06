'use strict';

const DataStore = require('./DataStore');
const fs = require('fs');
const MASK = '0777';
const IGNORED_MKDIR_ERROR = 'EEXIST';
const FILE_DOESNT_EXIST = 'ENOENT';


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

    /**
     * Write to the file, starting at the provided offset
     *
     * @param  {object} req http.incomingMessage
     * @param  {string} file_name   Name of file
     * @param  {integer} offset     starting offset
     * @return {Promise}
     */
    write(req, file_name, offset) {
        return new Promise((resolve, reject) => {
            const path = `${this.directory}/${file_name}`;
            const options = {
                flags: 'r+',
                start: offset,
            };

            const stream = fs.createWriteStream(path, options);

            if (!stream) {
                return reject(500);
            }

            let new_offset = 0;
            req.on('data', (buffer) => {
                new_offset += buffer.length;
            });

            req.on('end', () => {
                console.info(`[FileStore] write: ${new_offset} bytes written to ${path}`);
                offset += new_offset;
                console.info(`[FileStore] write: File is now ${offset} bytes`);
                resolve(offset);
            });

            stream.on('error', (e) => {
                console.warn('[FileStore] write: Error', e);
                reject(500);
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
            const file_path = `${this.directory}/${file_name}`;
            fs.stat(file_path, (error, stats) => {
                if (error && error.code === FILE_DOESNT_EXIST) {
                    console.warn(`[FileStore] getOffset: No file found at ${file_path}`);
                    return reject(404);
                }

                if (error) {
                    console.warn(error);
                    return reject(error);
                }

                return resolve(stats);
            });
        });
    }
}

module.exports = FileStore;
