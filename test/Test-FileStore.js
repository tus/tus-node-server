/* eslint-env node, mocha */

'use strict';
const request = require('supertest');
const should = require('should');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const exec = require('child_process').exec;
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');
const FileStore = require('../lib/stores/FileStore');
const File = require('../lib/models/File');
const TUS_RESUMABLE = require('../lib/constants').TUS_RESUMABLE;

const STORE_PATH = '/files';
const FILES_DIRECTORY = path.resolve(__dirname, `..${STORE_PATH}`);
const TEST_FILE_PATH = path.resolve(__dirname, 'test.mp4');
const TEST_FILE_SIZE = 960244;
const TEST_FILE_NAME = 'test_file.mp4';
const TEST_METADATA = 'some data, for you';


describe('FileStore', () => {
    let server;
    let created_file_name;
    let created_file_path;
    let deferred_file_name;
    let deferred_file_path;

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
    });


    describe('write', () => {
        it('should reject write streams that cant be opened', () => {
            return server.datastore.write()
                    .should.be.rejectedWith(500);
        });

        it('should open a stream and resolve the new offset', (done) => {
            const file_store = new FileStore({ path: STORE_PATH, directory: FILES_DIRECTORY });
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
    });

    describe('getOffset', () => {
        it('should reject non-existant files', () => {
            const file_store = new FileStore({ path: STORE_PATH });
            return file_store.getOffset('doesnt_exist')
                    .should.be.rejectedWith(404);
        });

        it('should resolve the stats for existant files', () => {
            const file_store = new FileStore({ path: STORE_PATH });
            return file_store.getOffset(TEST_FILE_NAME)
                    .should.be.fulfilledWith(fs.statSync(`${FILES_DIRECTORY}/${TEST_FILE_NAME}`));
        });
    });

    describe('POST', () => {
        it('should create a file in the provided directory', (done) => {
            request(server.listen())
            .post(STORE_PATH)
            .set('Tus-Resumable', TUS_RESUMABLE)
            .set('Upload-Length', 960244)
            .set('Upload-Metadata', TEST_METADATA)
            .expect(201)
            .end((err, res) => {
                created_file_name = res.headers.location.split('/').pop();
                created_file_path = path.resolve(FILES_DIRECTORY, created_file_name);
                assert.equal(fs.existsSync(created_file_path), true);
                done();
            });
        });

        it('should create a file with deferred length', (done) => {
            request(server.listen())
            .post(STORE_PATH)
            .set('Tus-Resumable', TUS_RESUMABLE)
            .set('Upload-Defer-Length', 1)
            .expect(201)
            .end((err, res) => {
                deferred_file_name = res.headers.location.split('/').pop();
                deferred_file_path = path.resolve(FILES_DIRECTORY, deferred_file_name);
                assert.equal(fs.existsSync(deferred_file_path), true);
                done();
            });
        });

        it('should 404 paths without a file id', (done) => {
            request(server.listen())
            .head(`${STORE_PATH}/`)
            .set('Tus-Resumable', TUS_RESUMABLE)
            .expect(404, done);
        });
    });

    describe('HEAD', () => {
        it('should return the starting offset and length', (done) => {
            request(server.listen())
            .head(`${STORE_PATH}/${created_file_name}`)
            .set('Tus-Resumable', TUS_RESUMABLE)
            .expect(200)
            .end((err, res) => {
                assert.equal(res.headers['upload-offset'], 0);
                assert.equal(res.headers['upload-length'], TEST_FILE_SIZE);
                done();
            });
        });

        it('should return the updated offset and length', (done) => {
            const source = fs.createReadStream(TEST_FILE_PATH);
            const dest = fs.createWriteStream(created_file_path);
            source.pipe(dest);
            source.on('end', () => {
                request(server.listen())
                .head(`${STORE_PATH}/${created_file_name}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(200)
                .end((err, res) => {
                    assert.equal(res.headers['upload-offset'], TEST_FILE_SIZE);
                    assert.equal(res.headers['upload-length'], TEST_FILE_SIZE);
                    done();
                });
            });
        });

        it('should return the defer header for deferred files', (done) => {
            request(server.listen())
            .head(`${STORE_PATH}/${deferred_file_name}`)
            .set('Tus-Resumable', TUS_RESUMABLE)
            .expect(200)
            .end((err, res) => {
                assert.equal(res.headers['upload-defer-length'], 1);
                assert.equal(res.headers['upload-length'], undefined);
                done();
            });
        });

        it('should return the upload metatata', (done) => {
            request(server.listen())
            .head(`${STORE_PATH}/${created_file_name}`)
            .set('Tus-Resumable', TUS_RESUMABLE)
            .expect(200)
            .end((err, res) => {
                assert.equal(res.headers['upload-metadata'], TEST_METADATA);
                done();
            });
        });

        it('should 404 files that dont exist', (done) => {
            request(server.listen())
            .head(`${STORE_PATH}/a_file_that_doesnt_exist`)
            .set('Tus-Resumable', TUS_RESUMABLE)
            .expect(404, done);
        });
    });
});
