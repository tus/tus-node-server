// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'assert';
// @ts-expect-error TS(2307): Cannot find module 'http' or its corresponding typ... Remove this comment to see the full error message
import http from 'http';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'sino... Remove this comment to see the full error message
import sinon from 'sinon';
import should from 'should';
import DataStore from '../lib/stores/DataStore.js';
import DeleteHandler from '../lib/handlers/DeleteHandler.js';
import { ERRORS, EVENTS } from '../lib/constants.js';
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('DeleteHandler', () => {
    const path = '/test/output';
    const fake_store = sinon.createStubInstance(DataStore);
    let handler: any;
    let req: any = null;
    let res: any = null;
    // @ts-expect-error TS(2304): Cannot find name 'beforeEach'.
    beforeEach(() => {
        fake_store.remove.resetHistory();
        handler = new DeleteHandler(fake_store, { relativeLocation: true, path });
        req = { headers: {}, url: handler.generateUrl({}, '1234') };
        res = new http.ServerResponse({ method: 'HEAD' });
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should 404 if no file id match', () => {
        fake_store.remove.rejects(ERRORS.FILE_NOT_FOUND);
        return assert.rejects(() => handler.send(req, res), { status_code: 404 });
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('should 404 if no file ID', async() => {
        sinon.stub(handler, 'getFileIdFromRequest').returns(false);
        await assert.rejects(() => handler.send(req, res), { status_code: 404 });
        assert.equal(fake_store.remove.callCount, 0);
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('must acknowledge successful DELETE requests with the 204', async() => {
        fake_store.remove.resolves();
        await handler.send(req, res);
        assert.equal(res.statusCode, 204);
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it(`must fire the ${EVENTS.EVENT_FILE_DELETED} event`, (done: any) => {
        fake_store.remove.resolves();
        handler.on(EVENTS.EVENT_FILE_DELETED, (event: any) => {
            assert.equal(event.file_id, '1234');
            done();
        });
        handler.send(req, res);
    });
});
