/* eslint-env node, mocha */

'use strict';
const should = require('should');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');
const GCSDataStore = require('../lib/stores/GCSDataStore');
const File = require('../lib/models/File');
const ERRORS = require('../lib/constants').ERRORS;

const STORE_PATH = '/files';
const PROJECT_ID = 'vimeo-open-source';
const KEYFILE = path.resolve(__dirname, 'keyfile.json');
const BUCKET = 'tus-node-server';

const TEST_FILE_SIZE = 960244;
const TEST_FILE_PATH = path.resolve(__dirname, 'test.mp4');
const TEST_METADATA = 'some data, for you';
const FILE_ALREADY_IN_BUCKET = 'dont_detete_this_file';

describe('GCSDataStore', () => {
    let server;
    let test_file_id;
    const files_created = [];
    before(() => {
        server = new Server();
        server.datastore = new GCSDataStore({
            path: STORE_PATH,
            projectId: PROJECT_ID,
            keyFilename: KEYFILE,
            bucket: BUCKET,
        });
    });

    after(() => {
        // Delete these files from the bucket for cleanup?
        console.log(files_created);
    });

    describe('constructor', () => {
        it('must require a bucket', () => {
            assert.throws(() => {
                new GCSDataStore({ path: STORE_PATH });
            }, Error);
        });

        it('must inherit from Datastore', () => {
            assert.equal(server.datastore instanceof DataStore, true);
        });

        it('must have a create method', () => {
            server.datastore.should.have.property('create');
        });

        it('must have a write method', () => {
            server.datastore.should.have.property('write');
        });

        it('must have a getOffset method', () => {
            server.datastore.should.have.property('getOffset');
        });
    });

    describe('_getBucket', () => {
        it('should be able to connect to GCS bucket', () => {
            assert.doesNotThrow(() => {
                server.datastore._getBucket();
            });
        });

        it('should set the bucket property to a bucket', () => {
            assert.equal(server.datastore.bucket.name, BUCKET);
        });
    });


    describe('getFileMetadata', () => {
        it('should resolve non-existent files with a size of 0', () => {
            return server.datastore.getFileMetadata('not_a_file')
                    .should.be.fulfilledWith({ size: 0 });
        });

        it('should resolve existing files with the metadata', () => {
            return server.datastore.getFileMetadata(FILE_ALREADY_IN_BUCKET)
                    .should.be.fulfilledWith({
                        size: `${TEST_FILE_SIZE}`,
                        upload_length: `${TEST_FILE_SIZE}`,
                        upload_metadata: undefined,
                    });
        });
    });

    describe('create', () => {
        it('should reject requests without a length header', () => {
            const req = {
                headers: {},
            };
            return server.datastore.create(req)
                    .should.be.rejectedWith(ERRORS.INVALID_LENGTH);
        });

        it('should create a file', (done) => {
            const req = {
                headers: {
                    'upload-length': TEST_FILE_SIZE,
                },
            };
            server.datastore.create(req)
                .then((file) => {
                    assert.equal(file instanceof File, true);
                    assert.equal(file.upload_length, TEST_FILE_SIZE);
                    test_file_id = file.id;
                    return done();
                }).catch(console.log);
        });
    });

    describe('write', () => {
        it('should open a stream and resolve the new offset', (done) => {
            const write_stream = fs.createReadStream(TEST_FILE_PATH);
            write_stream.once('open', () => {
                server.datastore.write(write_stream, test_file_id, 0)
                .then((offset) => {
                    files_created.push(test_file_id.split('&upload_id')[0]);
                    assert.equal(offset, TEST_FILE_SIZE);
                    return done();
                })
                .catch(console.log);
            });
        });
    });

    describe('getRange', () => {
        it('shouldnt ovveride size from getFileMetadata if range fails', () => {
            return server.datastore.getRange('hello')
                    .should.be.fulfilledWith({});
        });
    });
});
