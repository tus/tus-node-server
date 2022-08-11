const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

function randomString(size) {
    return crypto.randomBytes(size).toString('base64url').slice(0, size);
}

class FileStreamSplitter extends stream.Writable {
    constructor({ maxChunkSize, directory }, options) {
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

    _write(chunk, encoding, callback) {
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
                            return this._writeChunk(
                                chunk.slice(chunk.length - overflow, chunk.length)
                            );
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

    _final(callback) {
        if (this.fileDescriptor === null) {
            callback();
        }
        else {
            this._finishChunk()
                .then(() => callback())
                .catch(callback);
        }
    }

    _writeChunk(chunk) {
        return new Promise((resolve, reject) => {
            fs.write(this.fileDescriptor, chunk, (err) => {
                if (err) {
                    return reject(err);
                }

                this.currentChunkSize += chunk.length;
                return resolve();
            });
        });
    }

    _finishChunk() {
        if (this.fileDescriptor === null) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            fs.close(this.fileDescriptor, (err) => {
                if (err) {
                    return reject(err);
                }

                this.emit('chunkFinished', { path: this.currentChunkPath, size: this.currentChunkSize });

                this.currentChunkPath = null;
                this.fileDescriptor = null;
                this.currentChunkSize = null;

                this.part += 1;

                return resolve();
            });
        });
    }

    _newChunk() {
        return new Promise((resolve, reject) => {
            this.currentChunkPath = path.join(this.directory, `${this.filenameTemplate}-${this.part}`);
            fs.open(this.currentChunkPath, 'w', (err, fd) => {
                if (err) {
                    return reject(err);
                }

                this.emit('chunkStarted', this.currentChunkPath);

                this.currentChunkSize = 0;
                this.fileDescriptor = fd;

                return resolve();
            });
        });
    }
}

module.exports = { FileStreamSplitter };
