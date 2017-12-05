'use strict';

const DataStore = require('./DataStore');
const File = require('../models/File');
const fs = require('fs');
const Configstore = require('configstore');
const pkg = require('../../package.json');
const MASK = '0777';
const IGNORED_MKDIR_ERROR = 'EEXIST';
const FILE_DOESNT_EXIST = 'ENOENT';
const ERRORS = require('../constants').ERRORS;
const EVENTS = require('../constants').EVENTS;


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

        this.extensions = ['creation', 'creation-defer-length'];
        this.configstore = new Configstore(`${pkg.name}-${pkg.version}`);
        this._checkOrCreateDirectory();
        this.file = {
            size: {
                bytes: 0,
                chunks: 0,
            },
        };
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
     * @param  {object} req http.incomingMessage
     * @param  {File} file
     * @return {Promise}
     */
    create(req) {
        return new Promise((resolve, reject) => {
            const upload_length = req.headers['upload-length'];
            const upload_defer_length = req.headers['upload-defer-length'];
            const upload_metadata = req.headers['upload-metadata'];

            if (upload_length === undefined && upload_defer_length === undefined) {
                return reject(ERRORS.INVALID_LENGTH);
            }

            let file_id;
            try {
                file_id = this.generateFileName(req);
            }
            catch (generateError) {
                console.warn('[FileStore] create: check your namingFunction. Error', generateError);
                return reject(ERRORS.FILE_WRITE_ERROR);
            }

            const file = new File(file_id, upload_length, upload_defer_length, upload_metadata);

            return fs.open(`${this.directory}/${file.id}`, 'w', (err, fd) => {
                if (err) {
                    console.warn('[FileStore] create: Error', err);
                    return reject(err);
                }

                this.configstore.set(file.id, file);

                return fs.close(fd, (exception) => {
                    if (exception) {
                        console.warn('[FileStore] create: Error', exception);
                        return reject(exception);
                    }

                    this.emit(EVENTS.EVENT_FILE_CREATED, { file });
                    return resolve(file);
                });
            });
        });
    }

    /**
     * Write to the file, starting at the provided offset
     *
     * @param  {object} req http.incomingMessage
     * @param  {string} file_id   Name of file
     * @param  {integer} offset     starting offset
     * @return {Promise}
     */
    write(req, file_id, offset) {
        return new Promise((resolve, reject) => {
            const path = `${this.directory}/${file_id}`;
            const options = {
                flags: 'r+',
                start: offset,
            };

            const stream = fs.createWriteStream(path, options);

            let new_offset = 0;
            req.on('data', (buffer) => {
                new_offset += buffer.length;
            });

            stream.on('error', (e) => {
                console.warn('[FileStore] write: Error', e);
                reject(ERRORS.FILE_WRITE_ERROR);
            });

            return req.pipe(stream).on('finish', () => {
                console.info(`[FileStore] write: ${new_offset} bytes written to ${path}`);
                offset += new_offset;
                console.info(`[FileStore] write: File is now ${offset} bytes`);
                const config = this.configstore.get(file_id);

                this.file.size = {
                    bytes: this.file.size.bytes || parseInt(config.upload_length, 10),
                    chunks: this.file.size.chunks || Math.ceil(parseInt(config.upload_length, 10) / offset),
                };

                const uploadCompleted = parseInt(config.upload_length, 10) === offset;
                this.emit(EVENTS.EVENT_CHUNK_UPLOADED, {
                    file: config,
                    loaded: {
                        bytes: offset,
                        chunks: uploadCompleted ? this.file.size.chunks : offset / new_offset,
                    },
                    total: this.file.size,
                });
                if (config && uploadCompleted) {
                    this.emit(EVENTS.EVENT_UPLOAD_COMPLETE, { file: config });
                }
                resolve(offset);
            });
        });
    }

    /**
     * Return file stats, if they exits
     *
     * @param  {string} file_id name of the file
     * @return {object}           fs stats
     */
    getOffset(file_id) {
        const config = this.configstore.get(file_id);
        return new Promise((resolve, reject) => {
            const file_path = `${this.directory}/${file_id}`;
            fs.stat(file_path, (error, stats) => {
                if (error && error.code === FILE_DOESNT_EXIST && config) {
                    console.warn(`[FileStore] getOffset: No file found at ${file_path} but db record exists`, config);
                    return reject(ERRORS.FILE_NO_LONGER_EXISTS);
                }

                if (error && error.code === FILE_DOESNT_EXIST) {
                    console.warn(`[FileStore] getOffset: No file found at ${file_path}`);
                    return reject(ERRORS.FILE_NOT_FOUND);
                }

                if (error) {
                    return reject(error);
                }

                if (stats.isDirectory()) {
                    console.warn(`[FileStore] getOffset: ${file_path} is a directory`);
                    return reject(ERRORS.FILE_NOT_FOUND);
                }

                const data = Object.assign(stats, config);
                return resolve(data);
            });
        });
    }
}

module.exports = FileStore;
