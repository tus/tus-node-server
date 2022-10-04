const stream = require('stream');

class StreamTransformLimiter extends stream.Transform {
    constructor(limitBytes, options = {}) {
        super(options);

        this.remainingBytes = limitBytes;

        if (options.objectMode) {
            throw new Error('Object mode is not supported');
        }
    }

    _transform(chunk, encoding, callback) {
        if (!Buffer.isBuffer(chunk)) {
            callback(new Error('Only buffers are supported'));
            return;
        }

        const bytes = Math.min(chunk.length, this.remainingBytes);
        const data = chunk.subarray(0, bytes);

        this.remainingBytes -= data.length;

        callback(null, data);
    }
}


class StreamDuplexLimiter extends stream.Duplex {
    constructor(limitBytes, options = {}) {
        super(options);

        this.receivedBytes = 0;
        this.remainingBytes = limitBytes;

        if (options.objectMode) {
            throw new Error('Object mode is not supported');
        }
    }

    _write(chunk, encoding, callback) {
        if (!Buffer.isBuffer(chunk)) {
            callback(new Error('Only buffers are supported'));
            return;
        }

        this.receivedBytes += chunk.length;

        if (this.remainingBytes === 0) {
            callback();
            return;
        }

        const bytes = Math.min(chunk.length, this.remainingBytes);
        const data = chunk.subarray(0, bytes);

        this.remainingBytes -= data.length;

        const final = this.remainingBytes === 0;

        if (final) {
            this.push(data, encoding);
            this.push(null);

            callback();
        }
        else if (this.push(data, encoding)) {
            callback();
        }
        else {
            this.callback = callback;
        }
    }

    _read(size) {
        if (this.callback) {
            const callback = this.callback;
            this.callback = null;
            callback();
        }
    }

    _final(callback) {
        if (this.readable) {
            this.push(null);
        }

        callback();
    }
    _destroy(err, callback) {
        callback(err);
    }
}

module.exports = { StreamTransformLimiter, StreamDuplexLimiter };
