'use strict';

const DataStore = require('./DataStore');
const File = require('../models/File');
const fs = require('fs');
const stream = require('stream');
const Configstore = require('configstore');
const pkg = require('../../package.json');
const MASK = '0777';
const IGNORED_MKDIR_ERROR = 'EEXIST';
const FILE_DOESNT_EXIST = 'ENOENT';
const ERRORS = require('../constants').ERRORS;
const EVENTS = require('../constants').EVENTS;
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
        this.directory = options.directory || options.path.replace(/^\//, '');

        this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length'];
        this.configstore = new Configstore(`${pkg.name}-${pkg.version}`);
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
                log('[FileStore] create: check your namingFunction. Error', generateError);
                return reject(ERRORS.FILE_WRITE_ERROR);
            }

            const file = new File(file_id, upload_length, upload_defer_length, upload_metadata);
            return fs.open(`${this.directory}/${file.id}`, 'w', (err, fd) => {
                if (err) {
                    log('[FileStore] create: Error', err);
                    return reject(err);
                }

                this.configstore.set(file.id, file);

                return fs.close(fd, (exception) => {
                    if (exception) {
                        log('[FileStore] create: Error', exception);
                        return reject(exception);
                    }

                    this.emit(EVENTS.EVENT_FILE_CREATED, { file });
                    return resolve(file);
                });
            });
        });
    }

    /** Get file from filesystem
     *
     * @param {string} file_id    Name of the file
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
     * @param  {object} req http.incomingMessage
     * @return {Promise}
     */
    remove(req) {
        return new Promise((resolve, reject) => {
            const file_id = req.file_id;
            return fs.unlink(`${this.directory}/${file_id}`, (err, fd) => {
                if (err) {
                    console.warn('[FileStore] delete: Error', err);
                    return reject(ERRORS.FILE_NOT_FOUND);
                }
                this.emit(EVENTS.EVENT_FILE_DELETED, { file_id });
                this.configstore.delete(file_id);
                return resolve();
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

            const write_stream = fs.createWriteStream(path, options);
            if (!write_stream || req.destroyed) {
                reject(ERRORS.FILE_WRITE_ERROR);
                return;
            }

            let new_offset = 0;
            req.on('data', (buffer) => {
                new_offset += buffer.length;
            });

            stream.pipeline(req, write_stream, (err) => {
                if (err) {
                    log('[FileStore] write: Error', err);
                    return reject(ERRORS.FILE_WRITE_ERROR);
                }

                offset += new_offset;
                log(`[FileStore] write: File is now ${offset} bytes`);

                const config = this.configstore.get(file_id);
                if (config && parseInt(config.upload_length, 10) === offset) {
                    this.emit(EVENTS.EVENT_UPLOAD_COMPLETE, { file: config });
                }
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
    getOffset(file_id) {
        const config = this.configstore.get(file_id);
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
