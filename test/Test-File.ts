// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'node:assert';
import should from 'should';
import File from '../lib/models/File.js';
import Uid from '../lib/models/Uid.js';
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('File', () => {
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('constructor', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('must require a file_name', () => {
            assert.throws(() => {
                // @ts-expect-error TS(2554): Expected 4 arguments, but got 0.
                new File();
            }, Error);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('must be given either a upload_length or upload_defer_length', () => {
            assert.throws(() => {
                // @ts-expect-error TS(2554): Expected 4 arguments, but got 1.
                new File(Uid.rand());
            }, Error);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should set properties given', () => {
            const file_id = Uid.rand();
            const upload_length = 1234;
            const upload_defer_length = 1;
            const upload_metadata = 'metadata';
            const file = new File(file_id, upload_length, upload_defer_length, upload_metadata);
            assert.equal(file.id, file_id);
            assert.equal(file.upload_length, upload_length);
            assert.equal(file.upload_defer_length, upload_defer_length);
            assert.equal(file.upload_metadata, upload_metadata);
        });
    });
});
