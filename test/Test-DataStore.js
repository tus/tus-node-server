import assert from "assert";
import should from "should";
import DataStore from "../lib/stores/DataStore.js";
import File from "../lib/models/File.js";
describe('DataStore', () => {
    const datastore = new DataStore({ path: '/test/output' });
    it('should provide extensions', (done) => {
        datastore.should.have.property('extensions');
        assert.equal(datastore.extensions, null);
        datastore.extensions = ['creation', 'expiration'];
        assert.equal(datastore.extensions, 'creation,expiration');
        done();
    });
    it('extensions must be an array', (done) => {
        assert.throws(() => {
            datastore.extensions = 'creation, expiration';
        }, Error);
        done();
    });
    it('should check for an extension', (done) => {
        datastore.extensions = ['creation', 'expiration'];
        assert.equal(datastore.hasExtension('creation'), true);
        assert.equal(datastore.hasExtension('expiration'), true);
        assert.equal(datastore.hasExtension('concatentation'), false);
        assert.equal(datastore.hasExtension('CREATION'), false); // test case sensitivity
        done();
    });
    it('must have a create method', (done) => {
        datastore.should.have.property('create');
        datastore.create.should.be.type('function');
        done();
    });
    it('must have a remove method', (done) => {
        datastore.should.have.property('remove');
        datastore.remove();
        done();
    });
    it('must have a write method', (done) => {
        datastore.should.have.property('write');
        datastore.write.should.be.type('function');
        done();
    });
    it('must have a getOffset method', (done) => {
        datastore.should.have.property('getOffset');
        datastore.getOffset.should.be.type('function');
        done();
    });
});
