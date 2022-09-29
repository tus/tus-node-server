// @ts-expect-error TS(2307): Cannot find module 'path' or its corresponding typ... Remove this comment to see the full error message
import path from 'path';
import GCSDataStore from '../lib/stores/GCSDataStore.js';
import * as shared from './Test-Stores.shared';
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('GCSDataStore', () => {
    // @ts-expect-error TS(2304): Cannot find name 'before'.
    before(function(this: any) {
        this.testFileSize = 960244;
        this.testFileName = 'test.mp4';
        this.storePath = '/test/output';
        // @ts-expect-error TS(2304): Cannot find name '__dirname'.
        this.testFilePath = path.resolve(__dirname, 'fixtures', this.testFileName);
    });
    // @ts-expect-error TS(2304): Cannot find name 'beforeEach'.
    beforeEach(function(this: any) {
        this.datastore = new GCSDataStore({
            projectId: 'tus-node-server',
            // @ts-expect-error TS(2304): Cannot find name '__dirname'.
            keyFilename: path.resolve(__dirname, '../keyfile.json'),
            bucket: 'tus-node-server-ci',
        });
    });
    shared.shouldHaveStoreMethods();
    shared.shouldCreateUploads();
    // Termination extension not implemented yet
    // shared.shouldRemoveUploads()
    shared.shouldWriteUploads();
    shared.shouldHandleOffset();
    shared.shouldDeclareUploadLength(); // creation-defer-length extension
});
