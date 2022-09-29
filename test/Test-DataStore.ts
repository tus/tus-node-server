// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'assert';
import should from 'should';
import DataStore from '../lib/stores/DataStore.js';
import File from '../lib/models/File.js';
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('DataStore', () => {
    // @ts-expect-error TS(2554): Expected 0 arguments, but got 1.
    const datastore = new DataStore({ path: '/test/output' });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should provide extensions', (done: any) => {
        datastore.should.have.property('extensions');
        assert.equal(datastore.extensions, null);
        datastore.extensions = ['creation', 'expiration'];
        assert.equal(datastore.extensions, 'creation,expiration');
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('extensions must be an array', (done: any) => {
        assert.throws(() => {
            datastore.extensions = 'creation, expiration';
        }, Error);
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should check for an extension', (done: any) => {
        datastore.extensions = ['creation', 'expiration'];
        assert.equal(datastore.hasExtension('creation'), true);
        assert.equal(datastore.hasExtension('expiration'), true);
        assert.equal(datastore.hasExtension('concatentation'), false);
        assert.equal(datastore.hasExtension('CREATION'), false); // test case sensitivity
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('must have a create method', (done: any) => {
        datastore.should.have.property('create');
        datastore.create.should.be.type('function');
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('must have a remove method', (done: any) => {
        datastore.should.have.property('remove');
        // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
        datastore.remove();
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('must have a write method', (done: any) => {
        datastore.should.have.property('write');
        datastore.write.should.be.type('function');
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('must have a getOffset method', (done: any) => {
        datastore.should.have.property('getOffset');
        datastore.getOffset.should.be.type('function');
        done();
    });
});
