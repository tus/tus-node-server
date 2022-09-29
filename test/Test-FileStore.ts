import 'should';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import sinon from 'sinon';

import FileStore from '../lib/stores/FileStore';
import MemoryConfigstore from '../lib/configstores/MemoryConfigstore';
import File from '../lib/models/File';

import * as shared from './Test-Stores.shared';

describe('FileStore', function(this: any) {
    before(function(this: any) {
        this.testFileSize = 960244;
        this.testFileName = 'test.mp4';
        this.storePath = '/test/output';
        this.testFilePath = path.resolve(__dirname, 'fixtures', this.testFileName);
        this.filesDirectory = path.resolve(__dirname, `..${this.storePath}`);
    });

    beforeEach(function(this: any) {
        sinon.spy(fs, 'mkdir');
        this.datastore = new FileStore({
            directory: `${this.storePath.substring(1)}`,
            configstore: new MemoryConfigstore(),
        });
    });

    this.afterEach(() => {
        // @ts-expect-error
        fs.mkdir.restore();
    });

    it('should create a directory for the files', function(this: any, done: any) {
        // @ts-expect-error
        assert(fs.mkdir.calledOnce);
        // @ts-expect-error
        assert.equal(this.datastore.directory, fs.mkdir.getCall(0).args[0]);
        done();
    });

    describe('create', () => {
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 2.
        const file = new File('1234', '1000');

        it('should reject when the directory doesnt exist', function(this: any) {
            this.datastore.directory = 'some_new_path';
            return this.datastore.create(file).should.be.rejected();
        });

        it('should resolve when the directory exists', function(this: any) {
            return this.datastore.create(file).should.be.fulfilled();
        });

        it('should create an empty file', async function(this: any) {
            // TODO: this test would pass even if `datastore.create` would not create any file
            // as the file probably already exists from other tests
            await this.datastore.create(file);
            const stats = fs.statSync(path.join(this.datastore.directory, file.id));
            assert.equal(stats.size, 0);
        });
    });

    describe('write', function(this: any) {
        const file = new File('1234', `${this.testFileSize}`, undefined, 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');

        it('created file\'s size should match \'upload_length\'', async function(this: any) {
            await this.datastore.create(file);
            await this.datastore.write(fs.createReadStream(this.testFilePath), file.id, 0);
            const stats = fs.statSync(this.testFilePath);
            assert.equal(stats.size, this.testFileSize);
        });
    });

    describe('getOffset', () => {
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
