// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'node:assert/strict';
// @ts-expect-error TS(2307): Cannot find module 'fs' or its corresponding type ... Remove this comment to see the full error message
import fs from 'fs';
// @ts-expect-error TS(2307): Cannot find module 'stream' or its corresponding t... Remove this comment to see the full error message
import stream from 'stream';
import should from 'should';
import File from '../lib/models/File';
export const shouldHaveStoreMethods = function() {
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('the class', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('must have a write method', function(this: any, done: any) {
            this.datastore.should.have.property('write');
            done();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('must have a getOffset method', function(this: any, done: any) {
            this.datastore.should.have.property('getOffset');
            done();
        });
    });
};
export const shouldCreateUploads = function() {
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('create', () => {
        const file = new File('1234', '1000', undefined, 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 3.
        const file_defered = new File('1234', undefined, '1');
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should resolve to file', async function(this: any) {
            const newFile = await this.datastore.create(file);
            assert.equal(newFile instanceof File, true);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should report \'creation\' extension', function(this: any) {
            assert.equal(this.datastore.hasExtension('creation'), true);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should create new upload resource', async function(this: any) {
            await this.datastore.create(file);
            const data = await this.datastore.getOffset(file.id);
            assert.equal(data.size, 0);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should store `upload_length` when creating new resource', async function(this: any) {
            await this.datastore.create(file);
            const data = await this.datastore.getOffset(file.id);
            assert.strictEqual(data.upload_length, file.upload_length);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should store `upload_defer_length` when creating new resource', async function(this: any) {
            await this.datastore.create(file_defered);
            const data = await this.datastore.getOffset(file.id);
            assert.strictEqual(data.upload_defer_length, file_defered.upload_defer_length);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should store `upload_metadata` when creating new resource', async function(this: any) {
            await this.datastore.create(file);
            const data = await this.datastore.getOffset(file.id);
            assert.strictEqual(data.upload_metadata, file.upload_metadata);
        });
    });
};
export const shouldRemoveUploads = function() {
    // @ts-expect-error TS(2554): Expected 4 arguments, but got 2.
    const file = new File('1234', '1000');
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('remove (termination extension)', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should report \'termination\' extension', function(this: any) {
            assert.equal(this.datastore.hasExtension('termination'), true);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should reject when the file does not exist', function(this: any) {
            return this.datastore.remove('doesnt_exist').should.be.rejected();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should delete the file when it does exist', async function(this: any) {
            await this.datastore.create(file);
            return this.datastore.remove(file.id);
        });
    });
};
export const shouldWriteUploads = function() {
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('write', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should reject write streams that can not be open', async function(this: any) {
            const stream = fs.createReadStream(this.testFilePath);
            return this.datastore.write(stream, 'doesnt_exist', 0).should.be.rejected();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should reject whean readable stream has an error', async function(this: any) {
            const stream = fs.createReadStream(this.testFilePath);
            return this.datastore.write(stream, 'doesnt_exist', 0).should.be.rejected();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should write a stream and resolve the new offset', async function(this: any) {
            const file = new File('1234', `${this.testFileSize}`, undefined, 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');
            await this.datastore.create(file);
            const readable = fs.createReadStream(this.testFilePath);
            const offset = await this.datastore.write(readable, file.id, 0);
            assert.equal(offset, this.testFileSize);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should reject when stream is destroyed', async function(this: any) {
            const file = new File('1234', `${this.testFileSize}`, undefined, 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');
            await this.datastore.create(file);
            const readable = new stream.Readable({ read(size: any) {
                this.push('some data');
                this.destroy();
            } });
            const offset = this.datastore.write(readable, file.id, 0);
            return offset.should.be.rejected();
        });
    });
};
export const shouldHandleOffset = function() {
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('getOffset', function(this: any) {
        const file = new File('1234', `${this.testFileSize}`, undefined, 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should reject non-existant files', function(this: any) {
            return this.datastore.getOffset('doesnt_exist').should.be.rejected();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should resolve the stats for existing files', async function(this: any) {
            await this.datastore.create(file);
            const offset = await this.datastore.write(fs.createReadStream(this.testFilePath), file.id, 0);
            const data = await this.datastore.getOffset(file.id);
            assert.equal(data.size, offset);
        });
    });
};
export const shouldDeclareUploadLength = function() {
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('declareUploadLength', () => {
        const file = new File('1234', undefined, '1', 'filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,is_confidential');
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should reject non-existant files', function(this: any) {
            return this.datastore.declareUploadLength('doesnt_exist', '10').should.be.rejected();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should update upload_length after declaring upload length', async function(this: any) {
            await this.datastore.create(file);
            let data = await this.datastore.getOffset(file.id);
            assert.equal(data.upload_length, undefined);
            assert.equal(data.upload_defer_length, '1');
            await this.datastore.declareUploadLength(file.id, '10');
            data = await this.datastore.getOffset(file.id);
            assert.equal(data.upload_length, '10');
            assert.equal(data.upload_defer_length, undefined);
        });
    });
};
