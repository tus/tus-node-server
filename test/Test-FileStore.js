/* eslint-env node, mocha */

'use strict';
const should = require('should');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');
const FileStore = require('../lib/stores/FileStore');
const File = require('../lib/models/File');
const EVENTS = require('../lib/constants').EVENTS;

const STORE_PATH = '/files';
const FILES_DIRECTORY = path.resolve(__dirname, `..${STORE_PATH}`);
const TEST_FILE_PATH = path.resolve(__dirname, 'test.mp4');
const TEST_FILE_SIZE = 960244;
const TEST_FILE_NAME = 'test_file.mp4';


describe('FileStore', () => {
    let server;

    before((done) => {
        server = new Server();
        server.datastore = new FileStore({
            path: STORE_PATH,
        });

        // Create the file used in getOffset
        exec(`touch ${FILES_DIRECTORY}/${TEST_FILE_NAME}`, (err) => {
            if (err) {
                return done(err);
            }

            return done();
        });
    });

    after((done) => {
        // Remove the files directory
        exec(`rm -r ${FILES_DIRECTORY}`, (err) => {
            if (err) {
                return done(err);
            }

            // clear the config
            server.datastore.configstore.clear();
            return done();
        });
    });

    describe('constructor', () => {
        it('must inherit from Datastore', (done) => {
            assert.equal(server.datastore instanceof DataStore, true);
            done();
        });

        it('must have a create method', (done) => {
            server.datastore.should.have.property('create');
            done();
        });

        it('must have a write method', (done) => {
            server.datastore.should.have.property('write');
            done();
        });

        it('must have a getOffset method', (done) => {
            server.datastore.should.have.property('getOffset');
            done();
        });

        it('should create a directory for the files', (done) => {
            const stats = fs.lstatSync(FILES_DIRECTORY);
            assert.equal(stats.isDirectory(), true);
            done();
        });
    });

    describe('create', () => {
        const invalidReq = { headers: {}, url: STORE_PATH };
        const req = { headers: { 'upload-length': 1000 }, url: STORE_PATH };

        it('should reject if both upload-length and upload-defer-length are not provided', () => {
            const file_store = new FileStore({ path: STORE_PATH });
            return file_store.create(invalidReq)
                    .should.be.rejected();
        });

        it('should reject when namingFunction is invalid', () => {
            const namingFunction = (incomingReq) => incomingReq.body.filename.replace(/\//g, '-');
            const file_store = new FileStore({ path: STORE_PATH, namingFunction });
            return file_store.create(req)
                    .should.be.rejected();
        });

        it('should reject when the directory doesnt exist', () => {
            const file_store = new FileStore({ path: STORE_PATH });
            file_store.directory = 'some_new_path';
            return file_store.create(req)
                    .should.be.rejected();
        });

        it('should resolve when the directory exists', () => {
            const file_store = new FileStore({ path: STORE_PATH });
            return file_store.create(req)
                    .should.be.fulfilled();
        });

        it('should resolve to the File model', (done) => {
            const file_store = new FileStore({ path: STORE_PATH });
            file_store.create(req)
                .then((newFile) => {
                    assert.equal(newFile instanceof File, true);
                    return done();
                })
                .catch(done);
        });

        it('should use custom naming function when provided', (done) => {
            const namingFunction = (incomingReq) => incomingReq.url.replace(/\//g, '-');
            const file_store = new FileStore({ path: STORE_PATH, namingFunction });
            file_store.create(req)
                .then((newFile) => {
                    assert.equal(newFile instanceof File, true);
                    assert.equal(newFile.id, '-files');
                    return done();
                })
                .catch(done);
        });

        it(`should fire the ${EVENTS.EVENT_FILE_CREATED} event`, (done) => {
            const file_store = new FileStore({ path: STORE_PATH });
            file_store.on(EVENTS.EVENT_FILE_CREATED, (event) => {
                event.should.have.property('file');
                assert.equal(event.file instanceof File, true);
                done();
            });
            file_store.create(req);
        });
    });


    describe('write', () => {
        it('should reject write streams that cant be opened', () => {
            const write_stream = fs.createReadStream(TEST_FILE_PATH);
            return server.datastore.write(write_stream, null, 0)
                    .should.be.rejectedWith(500);
        });

        it('should reject write streams that cant be opened', () => {
            const write_stream = fs.createReadStream(TEST_FILE_PATH);
            return server.datastore.write(write_stream, '', 0)
                    .should.be.rejectedWith(500);
        });

        it('should open a stream and resolve the new offset', (done) => {
            const file_store = new FileStore({ path: STORE_PATH });
            // const file_store = new FileStore({ path: STORE_PATH, directory: FILES_DIRECTORY });
            const write_stream = fs.createReadStream(TEST_FILE_PATH);
            write_stream.once('open', () => {
                file_store.write(write_stream, TEST_FILE_NAME, 0)
                .then((offset) => {
                    assert.equal(offset, TEST_FILE_SIZE);
                    return done();
                })
                .catch(done);
            });
        });

        it(`should fire the ${EVENTS.EVENT_UPLOAD_COMPLETE} event`, (done) => {
            const file_store = new FileStore({ path: STORE_PATH });
            file_store.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
                event.should.have.property('file');
                done();
            });

            const write_stream = fs.createReadStream(TEST_FILE_PATH);
            write_stream.once('open', () => {
                const req = { headers: { 'upload-length': TEST_FILE_SIZE }, url: STORE_PATH }
                file_store.create(req)
                    .then((newFile) => {
                        return file_store.write(write_stream, newFile.id, 0);
                    }).catch(done);
            });
        });
    });

    describe('getOffset', () => {
        it('should reject non-existant files', () => {
            const file_store = new FileStore({ path: STORE_PATH });
            return file_store.getOffset('doesnt_exist')
                    .should.be.rejectedWith(404);
        });

        it('should reject directories', () => {
            const file_store = new FileStore({ path: STORE_PATH });
            return file_store.getOffset('')
                    .should.be.rejectedWith(404);
        });

        it('should resolve the stats for existant files', () => {
            const file_store = new FileStore({ path: STORE_PATH });
            return file_store.getOffset(TEST_FILE_NAME)
                    .should.be.fulfilledWith(fs.statSync(`${FILES_DIRECTORY}/${TEST_FILE_NAME}`));
        });
    });
});
