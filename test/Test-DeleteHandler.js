/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const http = require('http');

const sinon = require('sinon');
const should = require('should');

const DataStore = require('../lib/stores/DataStore');
const DeleteHandler = require('../lib/handlers/DeleteHandler');
const { ERRORS, EVENTS } = require('../lib/constants');

describe('DeleteHandler', () => {
    const path = '/test/output';
    const fake_store = sinon.createStubInstance(DataStore);
    let handler;

    let req = null;
    let res = null;

    beforeEach(() => {
        fake_store.remove.resetHistory();
        handler = new DeleteHandler(fake_store, { relativeLocation: true, path });

        req = { headers: {}, url: handler.generateUrl({}, '1234') };
        res = new http.ServerResponse({ method: 'HEAD' });
    });

    it('should 404 if no file id match', () => {
        fake_store.remove.rejects(ERRORS.FILE_NOT_FOUND);
        return assert.rejects(() => handler.send(req, res), { status_code: 404 });
    });

    it('should 404 if no file ID', async () => {
        sinon.stub(handler, "getFileIdFromRequest").returns(false);
        await assert.rejects(() => handler.send(req, res), { status_code: 404 });
        assert.equal(fake_store.remove.callCount, 0);
    });

    it('must acknowledge successful DELETE requests with the 204', async () => {
        fake_store.remove.resolves();
        await handler.send(req, res);
        assert.equal(res.statusCode, 204);
    });

    it(`must fire the ${EVENTS.EVENT_FILE_DELETED} event`, (done) => {
        fake_store.remove.resolves();
        handler.on(EVENTS.EVENT_FILE_DELETED, (event) => {
            assert.equal(event.file_id, '1234');
            done();
        })
        handler.send(req, res);
    });
});
