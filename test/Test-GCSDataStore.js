/* eslint-env node, mocha */

'use strict';
const should = require('should');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');
const GCSDataStore = require('../lib/stores/GCSDataStore');
const storage = require('@google-cloud/storage');
const File = require('../lib/models/File');
const ERRORS = require('../lib/constants').ERRORS;
const EVENTS = require('../lib/constants').EVENTS;

const STORE_PATH = '/files';
const PROJECT_ID = 'vimeo-open-source';
const KEYFILE = path.resolve(__dirname, '../keyfile.json');
const BUCKET = 'tus-node-server';

const TEST_FILE_SIZE = 960244;
const TEST_FILE_PATH = path.resolve(__dirname, 'test.mp4');
const FILE_ALREADY_IN_BUCKET = 'dont_delete_this_file.mp4';

const gcs = storage({
    projectId: PROJECT_ID,
    keyFilename: KEYFILE,
});

const bucket = gcs.bucket(BUCKET);
const deleteFile = (file_name) => {
    return new Promise((resolve, reject) => {
        console.log(`[GCLOUD] Deleting ${file_name} from ${bucket.name} bucket`);
        bucket.file(file_name).delete((err, res) => {
            resolve(res);
        });
    });
};

describe('GCSDataStore', () => {
    if (process.env.TRAVIS_SECURE_ENV_VARS !== 'true') {
        return;
    }

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

    after((done) => {
        // Delete these files from the bucket for cleanup
        const deletions = files_created.map((file_name) => deleteFile(file_name));
        Promise.all(deletions).then(() => {
            return done();
        }).catch(done);
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

    describe('create', () => {
        it('should reject when namingFunction is invalid', () => {
            const req = {
                headers: {
                    'upload-length': TEST_FILE_SIZE,
                },
            };
            const namingFunction = (incomingReq) => incomingReq.body.filename.replace(/\//g, '-');
            const file_store = new GCSDataStore({
                path: STORE_PATH,
                projectId: PROJECT_ID,
                keyFilename: KEYFILE,
                bucket: BUCKET,
                namingFunction
            });
            return file_store.create(req)
                    .should.be.rejected();
        });


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


        it(`should fire the ${EVENTS.EVENT_FILE_CREATED} event`, (done) => {
            server.datastore.on(EVENTS.EVENT_FILE_CREATED, (event) => {
                event.should.have.property('file');
                assert.equal(event.file instanceof File, true);
                done();
            });

            const req = {
                headers: {
                    'upload-length': TEST_FILE_SIZE,
                },
            };
            server.datastore.create(req)
                .catch(console.log);
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


        it(`should fire the ${EVENTS.EVENT_UPLOAD_COMPLETE} event`, (done) => {
            server.datastore.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
                event.should.have.property('file');
                done();
            });

            const write_stream = fs.createReadStream(TEST_FILE_PATH);
            write_stream.once('open', () => {
                server.datastore.write(write_stream, test_file_id, 0)
                    .catch(console.log);
            });
        });
    });

    describe('getOffset', () => {
        it('should reject non existent files', () => {
            return server.datastore.getOffset('not_a_file')
                    .should.be.rejectedWith(ERRORS.FILE_NOT_FOUND);
        });

        it('should resolve existing files with the metadata', () => {
            return server.datastore.getOffset(FILE_ALREADY_IN_BUCKET)
                    .should.be.fulfilledWith({
                        size: TEST_FILE_SIZE,
                        upload_length: TEST_FILE_SIZE,
                    });
        });
    });
});
