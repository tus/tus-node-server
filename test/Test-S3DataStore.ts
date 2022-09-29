// @ts-expect-error TS(2307): Cannot find module 'path' or its corresponding typ... Remove this comment to see the full error message
import path from 'path';
import Server from '../lib/Server.js';
import S3Store from '../lib/stores/S3Store.js';
import * as shared from './Test-Stores.shared';
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('S3DataStore', () => {
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
        this.datastore = new S3Store({
            // @ts-expect-error TS(2580): Cannot find name 'process'. Do you need to install... Remove this comment to see the full error message
            bucket: process.env.AWS_BUCKET,
            // @ts-expect-error TS(2580): Cannot find name 'process'. Do you need to install... Remove this comment to see the full error message
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            // @ts-expect-error TS(2580): Cannot find name 'process'. Do you need to install... Remove this comment to see the full error message
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            // @ts-expect-error TS(2580): Cannot find name 'process'. Do you need to install... Remove this comment to see the full error message
            region: process.env.AWS_REGION,
            partSize: 8 * 1024 * 1024, // each uploaded part will have ~8MB,
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
