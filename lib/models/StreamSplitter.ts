import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';

function randomString(size: number) {
    return crypto.randomBytes(size).toString('base64url').slice(0, size);
}

class FileStreamSplitter extends stream.Writable {
    currentChunkPath: any;
    currentChunkSize: any;
    directory: any;
    emit: any;
    fileDescriptor: any;
    filenameTemplate: any;
    maxChunkSize: any;
    on: any;
    part: any;
    constructor({
        maxChunkSize,
        directory,
    }: any, options: any) {
        super(options);
        this.maxChunkSize = maxChunkSize;
        this.currentChunkPath = null;
        this.currentChunkSize = null;
        this.fileDescriptor = null;
        this.directory = directory;
        this.filenameTemplate = randomString(10);
        this.part = 0;
        this.on('error', this._finishChunk.bind(this));
    }
    _write(chunk: any, encoding: any, callback: any) {
        Promise.resolve()
            .then(() => {
            // In order to start writing a chunk, we must first create
            // a file system reference for it
                if (this.fileDescriptor === null) {
                    return this._newChunk();
                }
                return undefined;
            })
            .then(() => {
                const overflow = this.currentChunkSize + chunk.length - this.maxChunkSize;
                // If the chunk is bigger than the defined max chunk size,
                // we need two passes to process the chunk
                if (overflow > 0) {
                    return this._writeChunk(chunk.slice(0, chunk.length - overflow))
                        .then(this._finishChunk.bind(this))
                        .then(this._newChunk.bind(this))
                        .then(() => {
                            return this._writeChunk(chunk.slice(chunk.length - overflow, chunk.length));
                        })
                        .then(() => callback())
                        .catch(callback);
                }
                // The chunk fits in the max chunk size
                return this._writeChunk(chunk)
                    .then(() => callback())
                    .catch(callback);
            })
            .catch(callback);
    }
    _final(callback: any) {
        if (this.fileDescriptor === null) {
            callback();
        }
        else {
            this._finishChunk()
                .then(() => callback())
                .catch(callback);
        }
    }
    _writeChunk(chunk: any) {
        return new Promise((resolve, reject) => {
            fs.write(this.fileDescriptor, chunk, (err: any) => {
                if (err) {
                    return reject(err);
                }
                this.currentChunkSize += chunk.length;
                // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                return resolve();
            });
        });
    }
    _finishChunk() {
        if (this.fileDescriptor === null) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            fs.close(this.fileDescriptor, (err: any) => {
                if (err) {
                    return reject(err);
                }
                this.emit('chunkFinished', { path: this.currentChunkPath, size: this.currentChunkSize });
                this.currentChunkPath = null;
                this.fileDescriptor = null;
                this.currentChunkSize = null;
                this.part += 1;
                // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                return resolve();
            });
        });
    }
    _newChunk() {
        return new Promise((resolve, reject) => {
            this.currentChunkPath = path.join(this.directory, `${this.filenameTemplate}-${this.part}`);
            fs.open(this.currentChunkPath, 'w', (err: any, fd: any) => {
                if (err) {
                    return reject(err);
                }
                this.emit('chunkStarted', this.currentChunkPath);
                this.currentChunkSize = 0;
                this.fileDescriptor = fd;
                // @ts-expect-error TS(2794): Expected 1 arguments, but got 0. Did you forget to... Remove this comment to see the full error message
                return resolve();
            });
        });
    }
}
export { FileStreamSplitter };
export default {
    FileStreamSplitter,
};
