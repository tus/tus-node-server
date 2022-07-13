'use strict';

const DataStore = require('./DataStore');
const fs = require('fs');
const stream = require('stream');
const Configstore = require('configstore');
const pkg = require('../../package.json');
const MASK = '0777';
const IGNORED_MKDIR_ERROR = 'EEXIST';
const FILE_DOESNT_EXIST = 'ENOENT';
const { ERRORS } = require('../constants');
const debug = require('debug');
const log = debug('tus-node-server:stores:filestore');

/**
 * @fileOverview
 * Store using local filesystem.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */

class FileStore extends DataStore {
    constructor(options) {
        super(options);
        this.directory = options.directory;
        this.configstore = options.configstore;

        if (!this.configstore)
            this.configstore = new Configstore(`${pkg.name}-${pkg.version}`);

        this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length', 'termination'];
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
        return new Promise((resolve, reject) => {
            return fs.open(`${this.directory}/${file.id}`, 'w', async (err, fd) => {
                if (err) {
                    log('[FileStore] create: Error', err);
                    return reject(err);
                }

                await this.configstore.set(file.id, file);

                return fs.close(fd, (exception) => {
                    if (exception) {
                        log('[FileStore] create: Error', exception);
                        return reject(exception);
                    }

                    return resolve(file);
                });
            });
        });
    }

    /** Get file from filesystem
     *
     * @param {string} file_id  Name of the file
     *
     * @return {stream.Readable}
     */
    read(file_id) {
        const path = `${this.directory}/${file_id}`;
        return fs.createReadStream(path);
    }

    /**
     * Deletes a file.
     *
     * @param {string} file_id  Name of the file
     * @return {Promise}
     */
    remove(file_id) {
        return new Promise((resolve, reject) => {
            return fs.unlink(`${this.directory}/${file_id}`, (err, fd) => {
                if (err) {
                    console.warn('[FileStore] delete: Error', err);
                    return reject(ERRORS.FILE_NOT_FOUND);
                }

                return this.configstore.delete(file_id)
                    .then(resolve)
                    .catch(reject);
            });
        });
    }

    /**
     * Write to the file, starting at the provided offset
     *
     * @param {object} readable stream.Readable
     * @param {string} file_id Name of file
     * @param {integer} offset starting offset
     * @return {Promise}
     */
    write(readable, file_id, offset) {
        return new Promise((resolve, reject) => {
            const path = `${this.directory}/${file_id}`;
            const options = {
                flags: 'r+',
                start: offset,
            };

            const writeable = fs.createWriteStream(path, options);

            let new_offset = 0;
            readable.on('data', (buffer) => {
                new_offset += buffer.length;
            });

            return stream.pipeline(readable, writeable, (err) => {
                if (err) {
                    log('[FileStore] write: Error', err);
                    return reject(ERRORS.FILE_WRITE_ERROR);
                }

                log(`[FileStore] write: ${new_offset} bytes written to ${path}`);
                offset += new_offset;
                log(`[FileStore] write: File is now ${offset} bytes`);

                return resolve(offset);
            });
        });
    }

    /**
     * Return file stats, if they exits
     *
     * @param  {string} file_id name of the file
     * @return {object}           fs stats
     */
    async getOffset(file_id) {
        const config = await this.configstore.get(file_id);
        return new Promise((resolve, reject) => {
            const file_path = `${this.directory}/${file_id}`;
            fs.stat(file_path, (error, stats) => {
                if (error && error.code === FILE_DOESNT_EXIST && config) {
                    log(`[FileStore] getOffset: No file found at ${file_path} but db record exists`, config);
                    return reject(ERRORS.FILE_NO_LONGER_EXISTS);
                }

                if (error && error.code === FILE_DOESNT_EXIST) {
                    log(`[FileStore] getOffset: No file found at ${file_path}`);
                    return reject(ERRORS.FILE_NOT_FOUND);
                }

                if (error) {
                    return reject(error);
                }

                if (stats.isDirectory()) {
                    log(`[FileStore] getOffset: ${file_path} is a directory`);
                    return reject(ERRORS.FILE_NOT_FOUND);
                }

                const data = Object.assign(stats, config);
                return resolve(data);
            });
        });
    }
}

module.exports = FileStore;
