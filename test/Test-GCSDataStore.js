/* eslint-env node, mocha */

'use strict';
const should = require('should');
const assert = require('assert');
const path = require('path');
const Server = require('../lib/Server');
const DataStore = require('../lib/stores/DataStore');
const GCSDataStore = require('../lib/stores/GCSDataStore');


const STORE_PATH = '/files';
const PROJECT_ID = 'vimeo-open-source';
const KEYFILE = path.resolve(__dirname, 'keyfile.json');
const BUCKET = 'tus-node-server';

const TEST_FILE_SIZE = 960244;
const TEST_FILE_NAME = 'test_file.mp4';
const TEST_METADATA = 'some data, for you';

describe('GCSDataStore', () => {
    let server;
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
    });

    // describe('_getBucket', () => {
    //     it('should ', () => {
    //     });
    // });

    // describe('_makeAuthorizedRequest', () => {
    //     it('should ', () => {
    //     });
    // });

    // describe('getFileMetadata', () => {
    //     it('should ', () => {
    //     });
    // });

    // describe('create', () => {
    //     it('should ', () => {
    //     });
    // });

    // describe('write', () => {
    //     it('should ', () => {
    //     });
    // });
    //
    // describe('getRange', () => {
    //     it('should ', () => {
    //     });
    // });
    // describe('getOffset', () => {
    //     it('should ', () => {
    //     });
    // });
});
