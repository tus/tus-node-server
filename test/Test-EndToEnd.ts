// @ts-expect-error TS(7016): Could not find a declaration file for module 'rimr... Remove this comment to see the full error message
import rimraf from 'rimraf';
// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'assert';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supe... Remove this comment to see the full error message
import request from 'supertest';
// @ts-expect-error TS(2307): Cannot find module 'path' or its corresponding typ... Remove this comment to see the full error message
import path from 'path';
// @ts-expect-error TS(2307): Cannot find module 'fs' or its corresponding type ... Remove this comment to see the full error message
import fs from 'fs';
import Server from '../lib/Server.js';
import FileStore from '../lib/stores/FileStore.js';
import GCSDataStore from '../lib/stores/GCSDataStore.js';
import * as storage from '@google-cloud/storage';
import { TUS_RESUMABLE as TUS_RESUMABLE$0 } from '../lib/constants.js';
const { Storage } = storage;
const TUS_RESUMABLE = { TUS_RESUMABLE: TUS_RESUMABLE$0 }.TUS_RESUMABLE;
const STORE_PATH = '/test/output';
const PROJECT_ID = 'tus-node-server';
// @ts-expect-error TS(2304): Cannot find name '__dirname'.
const KEYFILE = path.resolve(__dirname, '../keyfile.json');
const BUCKET = 'tus-node-server-ci';
// @ts-expect-error TS(2304): Cannot find name '__dirname'.
const FILES_DIRECTORY = path.resolve(__dirname, `..${STORE_PATH}`);
const TEST_FILE_SIZE = 960244;
// @ts-expect-error TS(2304): Cannot find name '__dirname'.
const TEST_FILE_PATH = path.resolve(__dirname, 'fixtures', 'test.mp4');
const TEST_METADATA = 'some data, for you';
const gcs = new Storage({
    projectId: PROJECT_ID,
    keyFilename: KEYFILE,
});
const bucket = gcs.bucket(BUCKET);
const deleteFile = (file_name: any) => {
    return new Promise((resolve, reject) => {
        console.log(`[GCLOUD] Deleting ${file_name} from ${bucket.name} bucket`);
        bucket.file(file_name).delete((err, res) => {
            resolve(res);
        });
    });
};
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('EndToEnd', () => {
    let server: any;
    let listener: any;
    let agent: any;
    let file_to_delete: any;
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('FileStore', () => {
        let file_id: any;
        let deferred_file_id: any;
        // @ts-expect-error TS(2304): Cannot find name 'before'.
        before(() => {
            server = new Server({
                path: STORE_PATH,
            });
            server.datastore = new FileStore({
                directory: `./${STORE_PATH}`,
            });
            listener = server.listen();
            agent = request.agent(listener);
        });
        // @ts-expect-error TS(2304): Cannot find name 'after'.
        after((done: any) => {
            // Remove the files directory
            rimraf(FILES_DIRECTORY, (err: any) => {
                if (err) {
                    return done(err);
                }
                // clear the config
                server.datastore.configstore.clear();
                listener.close();
                return done();
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('HEAD', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should 404 file ids that dont exist', (done: any) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(404)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('POST', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should create a file that will be deleted', (done: any) => {
                agent.post(STORE_PATH)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Defer-Length', 1)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(201)
                    .end((err: any, res: any) => {
                        assert.equal('location' in res.headers, true);
                        assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                        // Save the id for subsequent tests
                        file_to_delete = res.headers.location.split('/').pop();
                        done();
                    });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should create a file and respond with its location', (done: any) => {
                agent.post(STORE_PATH)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Length', TEST_FILE_SIZE)
                    .set('Upload-Metadata', TEST_METADATA)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(201)
                    .end((err: any, res: any) => {
                        assert.equal('location' in res.headers, true);
                        assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                        // Save the id for subsequent tests
                        file_id = res.headers.location.split('/').pop();
                        done();
                    });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should create a file with a deferred length', (done: any) => {
                agent.post(STORE_PATH)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Defer-Length', 1)
                    .set('Upload-Metadata', TEST_METADATA)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(201)
                    .end((err: any, res: any) => {
                        assert.equal('location' in res.headers, true);
                        assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                        // Save the id for subsequent tests
                        deferred_file_id = res.headers.location.split('/').pop();
                        done();
                    });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should create a file and upload content', (done: any) => {
                const read_stream = fs.createReadStream(TEST_FILE_PATH);
                const write_stream = agent.post(STORE_PATH)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Length', TEST_FILE_SIZE)
                    .set('Content-Type', 'application/offset+octet-stream');
                write_stream.on('response', (res: any) => {
                    assert.equal(res.statusCode, 201);
                    assert.equal(res.header['tus-resumable'], TUS_RESUMABLE);
                    assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`);
                    done();
                });
                // Using .pipe() broke when upgrading to Superagent 3.0+,
                // so now we use data events to read the file to the agent.
                read_stream.on('data', (chunk: any) => {
                    write_stream.write(chunk);
                });
                read_stream.on('end', () => {
                    write_stream.end(() => { });
                });
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('HEAD', () => {
            // @ts-expect-error TS(2304): Cannot find name 'before'.
            before((done: any) => {
                // Remove the file to delete for 410 Gone test
                rimraf(`${FILES_DIRECTORY}/${file_to_delete}`, () => {
                    return done();
                });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should return 410 Gone for the file that has been deleted', (done: any) => {
                agent.head(`${STORE_PATH}/${file_to_delete}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(410)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should return a starting offset, metadata for the new file', (done: any) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(200)
                    .expect('Upload-Metadata', TEST_METADATA)
                    .expect('Upload-Offset', '0')
                    .expect('Upload-Length', `${TEST_FILE_SIZE}`)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should return the defer length of the new deferred file', (done: any) => {
                agent.head(`${STORE_PATH}/${deferred_file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(200)
                    .expect('Upload-Offset', '0')
                    .expect('Upload-Defer-Length', '1')
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('PATCH', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should 404 paths without a file id', (done: any) => {
                agent.patch(`${STORE_PATH}/`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Offset', 0)
                    .set('Upload-Length', TEST_FILE_SIZE)
                    .set('Content-Type', 'application/offset+octet-stream')
                    .expect(404)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should 404 paths that do not exist', (done: any) => {
                agent.patch(`${STORE_PATH}/dont_exist`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Offset', 0)
                    .set('Upload-Length', TEST_FILE_SIZE)
                    .set('Content-Type', 'application/offset+octet-stream')
                    .expect(404)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should upload the file', (done: any) => {
                const read_stream = fs.createReadStream(TEST_FILE_PATH);
                const write_stream = agent.patch(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Offset', 0)
                    .set('Upload-Length', TEST_FILE_SIZE)
                    .set('Content-Type', 'application/offset+octet-stream');
                write_stream.on('response', (res: any) => {
                    // TODO: this is not called when request fails
                    assert.equal(res.statusCode, 204);
                    assert.equal(res.header['tus-resumable'], TUS_RESUMABLE);
                    assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`);
                    done();
                });
                // Using .pipe() broke when upgrading to Superagent 3.0+,
                // so now we use data events to read the file to the agent.
                read_stream.on('data', (chunk: any) => {
                    write_stream.write(chunk);
                });
                read_stream.on('end', () => {
                    write_stream.end(() => { });
                });
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('HEAD', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should return the ending offset of the uploaded file', (done: any) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(200)
                    .expect('Upload-Metadata', TEST_METADATA)
                    .expect('Upload-Offset', `${TEST_FILE_SIZE}`)
                    .expect('Upload-Length', `${TEST_FILE_SIZE}`)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('FileStore with relativeLocation', () => {
        // @ts-expect-error TS(2304): Cannot find name 'before'.
        before(() => {
            server = new Server({
                path: STORE_PATH,
                // configure the store to return relative path in Location Header
                relativeLocation: true,
            });
            server.datastore = new FileStore({
                directory: `./${STORE_PATH}`,
            });
            listener = server.listen();
            agent = request.agent(listener);
        });
        // @ts-expect-error TS(2304): Cannot find name 'after'.
        after(() => {
            listener.close();
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('POST', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should create a file and respond with its _relative_ location', (done: any) => {
                agent.post(STORE_PATH)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Length', `${TEST_FILE_SIZE}`)
                    .set('Upload-Metadata', TEST_METADATA)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(201)
                    .end((err: any, res: any) => {
                        assert.equal('location' in res.headers, true);
                        assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                        // the location header is not absolute
                        assert.equal(res.headers.location.indexOf('//') === -1, true);
                        // and contains the store path
                        assert.equal(res.headers.location.indexOf(STORE_PATH) > -1, true);
                        done();
                    });
            });
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('GCSDataStore', () => {
        let file_id: any;
        let deferred_file_id: any;
        const files_created: any = [];
        // @ts-expect-error TS(2304): Cannot find name 'before'.
        before(() => {
            server = new Server({
                path: STORE_PATH,
            });
            server.datastore = new GCSDataStore({
                projectId: PROJECT_ID,
                keyFilename: KEYFILE,
                bucket: BUCKET,
            });
            listener = server.listen();
            agent = request.agent(listener);
        });
        // @ts-expect-error TS(2304): Cannot find name 'after'.
        after((done: any) => {
            // Delete these files from the bucket for cleanup
            // @ts-expect-error TS(7006): Parameter 'file_name' implicitly has an 'any' type... Remove this comment to see the full error message
            const deletions = files_created.map((file_name) => deleteFile(file_name));
            Promise.all(deletions).then(() => {
                return done();
            }).catch(done);
            listener.close();
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('HEAD', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should 404 file ids that dont exist', (done: any) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(404)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
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
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should create a file and respond with its location', (done: any) => {
                agent.post(STORE_PATH)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Length', TEST_FILE_SIZE)
                    .set('Upload-Metadata', TEST_METADATA)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(201)
                    .end((err: any, res: any) => {
                        assert.equal('location' in res.headers, true);
                        assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                        // Save the id for subsequent tests
                        file_id = res.headers.location.split('/').pop();
                        files_created.push(file_id.split('&upload_id')[0]);
                        done();
                    });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should create a file with a deferred length', (done: any) => {
                agent.post(STORE_PATH)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Defer-Length', 1)
                    .set('Upload-Metadata', TEST_METADATA)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(201)
                    .end((err: any, res: any) => {
                        assert.equal('location' in res.headers, true);
                        assert.equal(res.headers['tus-resumable'], TUS_RESUMABLE);
                        // Save the id for subsequent tests
                        deferred_file_id = res.headers.location.split('/').pop();
                        files_created.push(deferred_file_id.split('&upload_id')[0]);
                        done();
                    });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should create a file and upload content', (done: any) => {
                const read_stream = fs.createReadStream(TEST_FILE_PATH);
                const write_stream = agent.post(STORE_PATH)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Length', TEST_FILE_SIZE)
                    .set('Content-Type', 'application/offset+octet-stream');
                write_stream.on('response', (res: any) => {
                    assert.equal(res.statusCode, 201);
                    assert.equal(res.header['tus-resumable'], TUS_RESUMABLE);
                    assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`);
                    done();
                });
                // Using .pipe() broke when upgrading to Superagent 3.0+,
                // so now we use data events to read the file to the agent.
                read_stream.on('data', (chunk: any) => {
                    write_stream.write(chunk);
                });
                read_stream.on('end', () => {
                    write_stream.end(() => { });
                });
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('HEAD', () => {
            // @ts-expect-error TS(2304): Cannot find name 'before'.
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
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should return a starting offset, metadata for the new file', (done: any) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(200)
                    .expect('Upload-Metadata', TEST_METADATA)
                    .expect('Upload-Offset', '0')
                    .expect('Upload-Length', `${TEST_FILE_SIZE}`)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should return the defer length of the new deferred file', (done: any) => {
                agent.head(`${STORE_PATH}/${deferred_file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(200)
                    .expect('Upload-Offset', '0')
                    .expect('Upload-Defer-Length', '1')
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('PATCH', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should 404 paths without a file id', (done: any) => {
                agent.patch(`${STORE_PATH}/`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Offset', 0)
                    .set('Upload-Length', `${TEST_FILE_SIZE}`)
                    .set('Content-Type', 'application/offset+octet-stream')
                    .expect(404)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should 404 paths that do not exist', (done: any) => {
                agent.patch(`${STORE_PATH}/dont_exist`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Offset', 0)
                    .set('Upload-Length', `${TEST_FILE_SIZE}`)
                    .set('Content-Type', 'application/offset+octet-stream')
                    .expect(404)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should upload the file', (done: any) => {
                const read_stream = fs.createReadStream(TEST_FILE_PATH);
                const write_stream = agent.patch(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Offset', 0)
                    .set('Upload-Length', `${TEST_FILE_SIZE}`)
                    .set('Content-Type', 'application/offset+octet-stream');
                write_stream.on('response', (res: any) => {
                    assert.equal(res.statusCode, 204);
                    assert.equal(res.header['tus-resumable'], TUS_RESUMABLE);
                    assert.equal(res.header['upload-offset'], `${TEST_FILE_SIZE}`);
                    bucket.file(file_id).getMetadata().then((result) => {
                        const metadata = result[0];
                        assert.equal(metadata.size, `${TEST_FILE_SIZE}`);
                        done();
                    }).catch(done);
                });
                // Using .pipe() broke when upgrading to Superagent 3.0+,
                // so now we use data events to read the file to the agent.
                read_stream.on('data', (chunk: any) => {
                    write_stream.write(chunk);
                });
                read_stream.on('end', () => {
                    write_stream.end(() => { });
                });
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('HEAD', () => {
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should return the ending offset of the uploaded file', (done: any) => {
                agent.head(`${STORE_PATH}/${file_id}`)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(200)
                    .expect('Upload-Metadata', TEST_METADATA)
                    .expect('Upload-Offset', `${TEST_FILE_SIZE}`)
                    .expect('Upload-Length', `${TEST_FILE_SIZE}`)
                    .expect('Tus-Resumable', TUS_RESUMABLE)
                    .end(done);
            });
        });
    });
});
