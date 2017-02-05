/* eslint-env node, mocha */

'use strict';
const should = require('should');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const mongodb = require('mongodb');
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');
const MongoGridFSStore = require('../lib/stores/MongoGridFSStore');
const File = require('../lib/models/File');
const ERRORS = require('../lib/constants').ERRORS;
const EVENTS = require('../lib/constants').EVENTS;
const TUS_RESUMABLE = require('../lib/constants').TUS_RESUMABLE;

const STORE_PATH = '/files';
const PROJECT_ID = 'vimeo-open-source';
const KEYFILE = path.resolve(__dirname, 'keyfile.json');
const BUCKET = 'tus-node-server';

const TEST_FILE_SIZE = 960244;
const TEST_FILE_PATH = path.resolve(__dirname, 'test.mp4');

let grid_fs = null;

const mongoURI = "mongodb://localhost/tus-unit-test";

describe.only('MongoGridFSStore', () => {
    let server;
    let test_file_id;
    const files_created = [];
    before(() => {
        server = new Server();
        server.datastore = new MongoGridFSStore({
            path: STORE_PATH,
            uri: mongoURI,
            bucket: BUCKET
        });

        return mongodb.connect(mongoURI).then((db) =>
        {
            grid_fs = new mongodb.GridFSBucket(db, {
                chunkSizeBytes: 1024 * 64,
                bucketName: BUCKET
            });
        });
    });

    after(() => {
        return grid_fs.drop();
    });

    describe('constructor', () => {
        it('must require a bucket', () => {
            assert.throws(() => {
                new MongoGridFSStore({ uri: mongoURI });
            }, Error);
        });
        
        it('must require a uri', () => {
            assert.throws(() => {
                new MongoGridFSStore({ bucket: BUCKET });
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
        it('should reject files with an invalid ID', () => {
            return server.datastore.getOffset('not_a_file')
                .should.be.rejectedWith("Argument passed in must be a single String of 12 bytes or a string of 24 hex characters");
        });
        it('should reject non existent files', () => {
            return server.datastore.getOffset(new mongodb.ObjectID())
                .should.be.rejectedWith(ERRORS.FILE_NOT_FOUND);
        });

        it('should resolve existing files with the metadata', () => {
            const stream = grid_fs.openUploadStream("file", {metadata:{
                upload_length: TEST_FILE_SIZE,
                tus_version: TUS_RESUMABLE
            }});

            const data = fs.readFileSync(TEST_FILE_PATH);
            stream.end(data);

            return new Promise((resolve, reject) =>
            {
                stream.once("finish", () => {
                return resolve(server.datastore.getOffset(stream.id.toString())
                    .should.be.fulfilledWith({
                        size: TEST_FILE_SIZE,
                        upload_length: TEST_FILE_SIZE
                    }));
                });
            });
        });
    });
});
