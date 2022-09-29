// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'assert';
// @ts-expect-error TS(2307): Cannot find module 'fs' or its corresponding type ... Remove this comment to see the full error message
import fs from 'fs';
// @ts-expect-error TS(2307): Cannot find module 'path' or its corresponding typ... Remove this comment to see the full error message
import path from 'path';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'sino... Remove this comment to see the full error message
import sinon from 'sinon';
import should from 'should';
import FileStore from '../lib/stores/FileStore.js';
import MemoryConfigstore from '../lib/configstores/MemoryConfigstore.js';
import File from '../lib/models/File.js';
import * as shared from './Test-Stores.shared';
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('FileStore', function(this: any) {
    // @ts-expect-error TS(2304): Cannot find name 'before'.
    before(function(this: any) {
        this.testFileSize = 960244;
        this.testFileName = 'test.mp4';
        this.storePath = '/test/output';
        // @ts-expect-error TS(2304): Cannot find name '__dirname'.
        this.testFilePath = path.resolve(__dirname, 'fixtures', this.testFileName);
        // @ts-expect-error TS(2304): Cannot find name '__dirname'.
        this.filesDirectory = path.resolve(__dirname, `..${this.storePath}`);
    });
    // @ts-expect-error TS(2304): Cannot find name 'beforeEach'.
    beforeEach(function(this: any) {
        sinon.spy(fs, 'mkdir');
        this.datastore = new FileStore({
            directory: `${this.storePath.substring(1)}`,
            configstore: new MemoryConfigstore(),
        });
    });
    this.afterEach(() => {
        fs.mkdir.restore();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should create a directory for the files', function(this: any, done: any) {
        assert(fs.mkdir.calledOnce);
        assert.equal(this.datastore.directory, fs.mkdir.getCall(0).args[0]);
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('create', () => {
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 2.
        const file = new File('1234', '1000');
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should reject when the directory doesnt exist', function(this: any) {
            this.datastore.directory = 'some_new_path';
            return this.datastore.create(file).should.be.rejected();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should resolve when the directory exists', function(this: any) {
            return this.datastore.create(file).should.be.fulfilled();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should create an empty file', async function(this: any) {
            // TODO: this test would pass even if `datastore.create` would not create any file
            // as the file probably already exists from other tests
            await this.datastore.create(file);
            const stats = fs.statSync(path.join(this.datastore.directory, file.id));
            assert.equal(stats.size, 0);
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('write', function(this: any) {
        const file = new File('1234', `${this.testFileSize}`, undefined, 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('created file\'s size should match \'upload_length\'', async function(this: any) {
            await this.datastore.create(file);
            await this.datastore.write(fs.createReadStream(this.testFilePath), file.id, 0);
            const stats = fs.statSync(this.testFilePath);
            assert.equal(stats.size, this.testFileSize);
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('getOffset', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should reject directories', function(this: any) {
            return this.datastore.getOffset('').should.be.rejected();
        });
    });
    shared.shouldHaveStoreMethods();
    shared.shouldCreateUploads();
    shared.shouldRemoveUploads(); // termination extension
    shared.shouldWriteUploads();
    shared.shouldHandleOffset();
    shared.shouldDeclareUploadLength(); // creation-defer-length extension
});
