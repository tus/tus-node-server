import DataStore from "./DataStore";
// @ts-expect-error TS(2307): Cannot find module 'fs' or its corresponding type ... Remove this comment to see the full error message
import fs from "fs";
// @ts-expect-error TS(2307): Cannot find module 'path' or its corresponding typ... Remove this comment to see the full error message
import path from "path";
// @ts-expect-error TS(2307): Cannot find module 'stream' or its corresponding t... Remove this comment to see the full error message
import stream from "stream";
// @ts-expect-error TS(7016): Could not find a declaration file for module 'conf... Remove this comment to see the full error message
import Configstore from "configstore";
// @ts-expect-error TS(2732): Cannot find module '../../packageon'. Consider ... Remove this comment to see the full error message
import pkg from "../../package.json" assert { type: "json" };
import { ERRORS } from "../constants";
// @ts-expect-error TS(7016): Could not find a declaration file for module 'debu... Remove this comment to see the full error message
import * as debug from "debug";
const MASK = '0777';
const IGNORED_MKDIR_ERROR = 'EEXIST';
const FILE_DOESNT_EXIST = 'ENOENT';
const log = debug('tus-node-server:stores:filestore');
/**
 * @fileOverview
 * Store using local filesystem.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */
class FileStore extends DataStore {
    // @ts-expect-error TS(7006): Parameter 'options' implicitly has an 'any' type.
    constructor(options) {
        // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
        super(options);
        (this as any).directory = options.directory;
        (this as any).configstore = options.configstore;
        if (!(this as any).configstore) {
            (this as any).configstore = new Configstore(`${pkg.name}-${pkg.version}`);
        }
        this.extensions = ['creation', 'creation-with-upload', 'creation-defer-length', 'termination'];
        this._checkOrCreateDirectory();
    }
    /**
     *  Ensure the directory exists.
     */
    _checkOrCreateDirectory() {
        // @ts-expect-error TS(7006): Parameter 'error' implicitly has an 'any' type.
        fs.mkdir((this as any).directory, MASK, (error) => {
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
    // @ts-expect-error TS(7006): Parameter 'file' implicitly has an 'any' type.
    create(file) {
        return new Promise((resolve, reject) => {
            // @ts-expect-error TS(7006): Parameter 'err' implicitly has an 'any' type.
            return fs.open(path.join((this as any).directory, file.id), 'w', async (err, fd) => {
    if (err) {
        log('[FileStore] create: Error', err);
        return reject(err);
    }
    // @ts-expect-error TS(2339): Property 'configstore' does not exist on type 'Fil... Remove this comment to see the full error message
    await this.configstore.set(file.id, file);
    // @ts-expect-error TS(7006): Parameter 'exception' implicitly has an 'any' type... Remove this comment to see the full error message
    return fs.close(fd, (exception) => {
        if (exception) {
            log('[FileStore] create: Error', exception);
            return reject(exception);
        }
        return resolve(file);
    });
});
                // @ts-expect-error TS(2311): Cannot find name 'await'. Did you mean to write th... Remove this comment to see the full error message
                await (this as any).configstore.set(file.id, file);
                // @ts-expect-error TS(2304): Cannot find name 'fd'.
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
    // @ts-expect-error TS(2304): Cannot find name 'read'.
    read(file_id) {
        return fs.createReadStream(path.join((this as any).directory, file_id));
    }
    /**
     * Deletes a file.
     *
     * @param {string} file_id  Name of the file
     * @return {Promise}
     */
    // @ts-expect-error TS(2304): Cannot find name 'remove'.
    remove(file_id) {
        return new Promise((resolve, reject) => {
            return fs.unlink(`${(this as any).directory}/${file_id}`, async (err, fd) => {
    if (err) {
        log('[FileStore] delete: Error', err);
        reject(ERRORS.FILE_NOT_FOUND);
        return;
    }
    try {
        resolve(await this.configstore.delete(file_id));
    }
    catch (error) {
        reject(error);
    }
});
                    resolve(await (this as any).configstore.delete(file_id));
                }
                catch (error) {
                    // @ts-expect-error TS(2304): Cannot find name 'reject'.
                    reject(error);
                }
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
    // @ts-expect-error TS(2304): Cannot find name 'write'.
    write(readable, file_id, offset) {
        // @ts-expect-error TS(2304): Cannot find name 'file_id'.
        const writeable = fs.createWriteStream(path.join((this as any).directory, file_id), {
    flags: 'r+',
    // @ts-expect-error TS(2304): Cannot find name 'offset'.
    start: offset,
});
        let bytes_received = 0;
        const transform = new stream.Transform({
            // @ts-expect-error TS(7006): Parameter 'chunk' implicitly has an 'any' type.
            transform(chunk, encoding, callback) {
                bytes_received += chunk.length;
                callback(null, chunk);
            },
        });
        return new Promise((resolve, reject) => {
            stream.pipeline(readable, transform, writeable, (err) => {
                if (err) {
                    log('[FileStore] write: Error', err);
                    return reject(ERRORS.FILE_WRITE_ERROR);
                }
                log(`[FileStore] write: ${bytes_received} bytes written to ${path}`);
                offset += bytes_received;
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
    // @ts-expect-error TS(2304): Cannot find name 'async'.
    async getOffset(file_id) {
        // @ts-expect-error TS(2304): Cannot find name 'file_id'.
        const config = await (this as any).configstore.get(file_id);
        return new Promise((resolve, reject) => {
            const file_path = `${(this as any).directory}/${file_id}`;
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
                config.size = stats.size;
                return resolve(config);
            });
        });
    }
    // @ts-expect-error TS(2304): Cannot find name 'async'.
    async declareUploadLength(file_id, upload_length) {
        // @ts-expect-error TS(2304): Cannot find name 'file_id'.
        const file = await (this as any).configstore.get(file_id);
        if (!file) {
            throw ERRORS.FILE_NOT_FOUND;
        }
        // @ts-expect-error TS(2304): Cannot find name 'upload_length'.
        file.upload_length = upload_length;
        file.upload_defer_length = undefined;
        // @ts-expect-error TS(2304): Cannot find name 'file_id'.
        (this as any).configstore.set(file_id, file);
    }
}
export default FileStore;
