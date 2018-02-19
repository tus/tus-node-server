/* eslint-env node, mocha */

'use strict';
const should = require('should');
const assert = require('assert');
const request = require('supertest');
const exec = require('child_process').exec;
const path = require('path');
const fs = require('fs');
const Server = require('../lib/Server');
const FileStore = require('../lib/stores/FileStore');
const GCSDataStore = require('../lib/stores/GCSDataStore');
const storage = require('@google-cloud/storage');
const TUS_RESUMABLE = require('../lib/constants').TUS_RESUMABLE;

const STORE_PATH = '/files';
const PROJECT_ID = 'vimeo-open-source';
const KEYFILE = path.resolve(__dirname, '../keyfile.json');
const BUCKET = 'tus-node-server';

const FILES_DIRECTORY = path.resolve(__dirname, `..${STORE_PATH}`);
const TEST_FILE_SIZE = 960244;
const TEST_FILE_PATH = path.resolve(__dirname, 'test.mp4');
const TEST_METADATA = 'some data, for you';

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

describe('EndToEnd', () => {
    let server;
    let agent;
    let file_to_delete;
    describe('FileStore', () => {
        let file_id;
        let deferred_file_id;
        before(() => {
            server = new Server();
            server.datastore = new FileStore({
                path: STORE_PATH,
            });
            agent = request.agent(server.listen());
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

        describe('HEAD', () => {
            it('should 404 file ids that dont exist', (done) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(404)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });
        });

        describe('POST', () => {
            it('should create a file that will be deleted', (done) => {
                agent.post(STORE_PATH)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Defer-Length', 1)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(201)
                .end((err, res) => {
                    assert.equal('location' in res.headers, true);
                    assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                    // Save the id for subsequent tests
                    file_to_delete = res.headers.location.split('/').pop();
                    done();
                });
            });

            it('should create a file and respond with its location', (done) => {
                agent.post(STORE_PATH)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Length', TEST_FILE_SIZE)
                .set('Upload-Metadata', TEST_METADATA)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(201)
                .end((err, res) => {
                    assert.equal('location' in res.headers, true);
                    assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                    // Save the id for subsequent tests
                    file_id = res.headers.location.split('/').pop();
                    done();
                });
            });

            it('should create a file with a deferred length', (done) => {
                agent.post(STORE_PATH)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Defer-Length', 1)
                .set('Upload-Metadata', TEST_METADATA)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(201)
                .end((err, res) => {
                    assert.equal('location' in res.headers, true);
                    assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                    // Save the id for subsequent tests
                    deferred_file_id = res.headers.location.split('/').pop();
                    done();
                });
            });
        });

        describe('HEAD', () => {
            before((done) => {
                // Remove the file to delete for 410 Gone test
                exec(`rm ${FILES_DIRECTORY}/${file_to_delete}`, () => {
                    return done();
                });
            });

            it('should return 410 Gone for the file that has been deleted', (done) => {
                agent.head(`${STORE_PATH}/${file_to_delete}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(410)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });

            it('should return a starting offset, metadata for the new file', (done) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(200)
                .expect('Upload-Metadata', TEST_METADATA)
                .expect('Upload-Offset', 0)
                .expect('Upload-Length', TEST_FILE_SIZE)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });

            it('should return the defer length of the new deferred file', (done) => {
                agent.head(`${STORE_PATH}/${deferred_file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(200)
                .expect('Upload-Offset', 0)
                .expect('Upload-Defer-Length', 1)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });
        });

        describe('PATCH', () => {
            it('should 404 paths without a file id', (done) => {
                agent.patch(`${STORE_PATH}/`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Offset', 0)
                .set('Content-Type', 'application/offset+octet-stream')
                .expect(404)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });

            it('should 404 paths that do not exist', (done) => {
                agent.patch(`${STORE_PATH}/dont_exist`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Offset', 0)
                .set('Content-Type', 'application/offset+octet-stream')
                .expect(404)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });

            it('should upload the file', (done) => {
                const read_stream = fs.createReadStream(TEST_FILE_PATH);
                const write_stream = agent.patch(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Offset', 0)
                    .set('Content-Type', 'application/offset+octet-stream');

                write_stream.on('response', (res) => {
                    assert.equal(res.statusCode, 204);
                    assert.equal(res.header['tus-resumable'], TUS_RESUMABLE);
                    assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`);
                    done();
                });

                read_stream.pipe(write_stream);
            });
        });

        describe('HEAD', () => {
            it('should return the ending offset of the uploaded file', (done) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(200)
                .expect('Upload-Metadata', TEST_METADATA)
                .expect('Upload-Offset', TEST_FILE_SIZE)
                .expect('Upload-Length', TEST_FILE_SIZE)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });
        });
    });

    describe('GCSDataStore', () => {
        if (process.env.TRAVIS_SECURE_ENV_VARS !== 'true') {
            return;
        }

        let file_id;
        let deferred_file_id;
        const files_created = [];
        before(() => {
            server = new Server();
            server.datastore = new GCSDataStore({
                path: STORE_PATH,
                projectId: PROJECT_ID,
                keyFilename: KEYFILE,
                bucket: BUCKET,
            });
            agent = request.agent(server.listen());
        });

        after((done) => {
            // Delete these files from the bucket for cleanup
            const deletions = files_created.map((file_name) => deleteFile(file_name));
            Promise.all(deletions).then(() => {
                return done();
            }).catch(done);
        });

        describe('HEAD', () => {
            it('should 404 file ids that dont exist', (done) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(404)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });
        });

        describe('POST', () => {
            // it('should create a file that will be deleted', (done) => {
            //     agent.post(STORE_PATH)
            //     .set('Tus-Resumable', TUS_RESUMABLE)
            //     .set('Upload-Defer-Length', 1)
            //     .set('Tus-Resumable', TUS_RESUMABLE)
            //     .expect(201)
            //     .end((err, res) => {
            //         assert.equal('location' in res.headers, true);
            //         assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
            //         // Save the id for subsequent tests
            //         file_to_delete = res.headers.location.split('/').pop();
            //         files_created.push(file_to_delete.split('&upload_id')[0])
            //         done();
            //     });
            // });

            it('should create a file and respond with its location', (done) => {
                agent.post(STORE_PATH)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Length', TEST_FILE_SIZE)
                .set('Upload-Metadata', TEST_METADATA)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(201)
                .end((err, res) => {
                    assert.equal('location' in res.headers, true);
                    assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                    // Save the id for subsequent tests
                    file_id = res.headers.location.split('/').pop();
                    files_created.push(file_id.split('&upload_id')[0]);
                    done();
                });
            });

            it('should create a file with a deferred length', (done) => {
                agent.post(STORE_PATH)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Defer-Length', 1)
                .set('Upload-Metadata', TEST_METADATA)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(201)
                .end((err, res) => {
                    assert.equal('location' in res.headers, true);
                    assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                    // Save the id for subsequent tests
                    deferred_file_id = res.headers.location.split('/').pop();
                    files_created.push(deferred_file_id.split('&upload_id')[0]);
                    done();
                });
            });
        });

        describe('HEAD', () => {
            before(() => {
                // Remove the file to delete for 410 Gone test
            });

            // it('should return 410 Gone for the file that has been deleted', (done) => {
            //     agent.head(`${STORE_PATH}/${file_to_delete}`)
            //     .set('Tus-Resumable', TUS_RESUMABLE)
            //     .expect(410)
            //     .expect('Tus-Resumable', TUS_RESUMABLE)
            //     .end(done);
            // });

            it('should return a starting offset, metadata for the new file', (done) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(200)
                .expect('Upload-Metadata', TEST_METADATA)
                .expect('Upload-Offset', 0)
                .expect('Upload-Length', TEST_FILE_SIZE)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });

            it('should return the defer length of the new deferred file', (done) => {
                agent.head(`${STORE_PATH}/${deferred_file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(200)
                .expect('Upload-Offset', 0)
                .expect('Upload-Defer-Length', 1)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });
        });

        describe('PATCH', () => {
            it('should 404 paths without a file id', (done) => {
                agent.patch(`${STORE_PATH}/`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Offset', 0)
                .set('Content-Type', 'application/offset+octet-stream')
                .expect(404)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });

            it('should 404 paths that do not exist', (done) => {
                agent.patch(`${STORE_PATH}/dont_exist`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Offset', 0)
                .set('Content-Type', 'application/offset+octet-stream')
                .expect(404)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });

            it('should upload the file', (done) => {
                const read_stream = fs.createReadStream(TEST_FILE_PATH);
                const write_stream = agent.patch(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Offset', 0)
                    .set('Content-Type', 'application/offset+octet-stream');

                write_stream.on('response', (res) => {
                    assert.equal(res.statusCode, 204);
                    assert.equal(res.header['tus-resumable'], TUS_RESUMABLE);
                    assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`);
                    done();
                });

                read_stream.pipe(write_stream);
            });
        });

        describe('HEAD', () => {
            // mocha cant use arrow functions for setting timeout
            before(function(done) {
                this.timeout(0);

                // GCS need a few seconds before it can show the changes
                const TIMEOUT = 5000;
                console.log(`Pausing for ${TIMEOUT / 1000} seconds while GCS updates...`);
                setTimeout(() => {
                    done();
                }, TIMEOUT);
            });

            it('should return the ending offset of the uploaded file', (done) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(200)
                .expect('Upload-Metadata', TEST_METADATA)
                .expect('Upload-Offset', TEST_FILE_SIZE)
                .expect('Upload-Length', TEST_FILE_SIZE)
                .expect('Tus-Resumable', TUS_RESUMABLE)
                .end(done);
            });
        });
    });
});
