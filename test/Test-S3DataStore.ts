import path from "path";
import Server from "../lib/Server.js";
import S3Store from "../lib/stores/S3Store.js";
import * as shared from "./Test-Stores.shared";
describe('S3DataStore', function () {
    before(function () {
        this.testFileSize = 960244;
        this.testFileName = 'test.mp4';
        this.storePath = '/test/output';
        this.testFilePath = path.resolve(__dirname, 'fixtures', this.testFileName);
    });
    beforeEach(function () {
        this.datastore = new S3Store({
            bucket: process.env.AWS_BUCKET,
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
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
