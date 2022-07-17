/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const http = require('http');
const should = require('should');
const PatchHandler = require('../lib/handlers/PatchHandler');
const DataStore = require('../lib/stores/DataStore');

const hasHeader = (res, header) => {
    if (typeof header === 'string') {
        return res._header.indexOf(`${header}:`) > -1;
    }
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};

describe('PatchHandler', () => {
    const path = '/test/output';
    let res = null;
    const store = new DataStore();
    const handler = new PatchHandler(store, { path });
    const req = { headers: {} };

    beforeEach((done) => {
        res = new http.ServerResponse({ method: 'PATCH' });
        done();
    });

    it('should 403 if no Content-Type header', (done) => {
        req.headers = {};
        req.url = `${path}/1234`;
        handler.send(req, res);
        assert.equal(res.statusCode, 403);
        done();
    });

    it('should 403 if no Upload-Offset header', (done) => {
        req.headers = { 'content-type': 'application/offset+octet-stream' };
        req.url = `${path}/1234`;
        handler.send(req, res);
        assert.equal(res.statusCode, 403);
        done();
    });

    describe('send()', () => {

        it('should 404 urls without a path', () => {
            req.url = `${path}/`;
            handler.send(req, res);
            assert.equal(res.statusCode, 404);
        });

        it('should 403 if the offset is omitted', () => {
            req.headers = {
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/file`;
            handler.send(req, res);
            assert.equal(res.statusCode, 403);
        });

        it('should 403 the content-type is omitted', () => {
            req.headers = {
                'upload-offset': 0,
            };
            req.url = `${path}/file`;
            handler.send(req, res);
            assert.equal(res.statusCode, 403);
        });

        it('must return a promise if the headers validate', () => {
            req.headers = {
                'upload-offset': 0,
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;
            handler.send(req, res).should.be.a.Promise();
        });

        it('must 409 if the offset does not match', () => {
            req.headers = {
                'upload-offset': 10,
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;

            return handler.send(req, res)
                .then(() => {
                    assert.equal(res.statusCode, 409);
                });
        });

        it('must acknowledge successful PATCH requests with the 204', () => {
            req.headers = {
                'upload-offset': 0,
                'content-type': 'application/offset+octet-stream',
            };
            req.url = `${path}/1234`;

            return handler.send(req, res)
                .then(() => {
                    assert.equal(hasHeader(res, { 'Upload-Offset': 0 }), true);
                    assert.equal(hasHeader(res, 'Content-Length'), false);
                    assert.equal(res.statusCode, 204);
                });
        });

        // it('should open a stream, resolve the new offset, and emit upload complete', function (done) {
        //     const uploadCompleteEvent = sinon.fake()
        //     const req = {
        //         headers: {
        //             'upload-length': this.testFileSize.toString(),
        //             'upload-metadata': 'foo bar',
        //         },
        //         url: this.storePath,
        //     }

        //     this.server.datastore.on(EVENTS.EVENT_UPLOAD_COMPLETE, uploadCompleteEvent)

        //     const stream = fs.createReadStream(this.testFilePath)
        //     const size = this.testFileSize
        //     let id

        //     stream.once('open', () => {
        //         this.server.datastore
        //             .create(req)
        //             .then((file) => {
        //                 id = file.id
        //                 return this.server.datastore.write(stream, file.id, 0)
        //             })
        //             .then((offset) => {
        //                 assert.equal(offset, size)
        //                 assert.equal(uploadCompleteEvent.calledOnce, true)
        //                 return this.server.datastore.getOffset(id)
        //             })
        //             .then((stats) => {
        //                 assert.equal(stats.upload_length, size)
        //             })
        //             .then(done)
        //             .catch(done)
        //     })
        // })
    });

});
