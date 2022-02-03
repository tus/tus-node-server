/* eslint-env node, mocha */
'use strict';

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const FileStore = require('../lib/stores/FileStore');
const DeleteHandler = require('../lib/handlers/DeleteHandler');

describe('DeleteHandler', () => {
    let res = null;
    const path = '/files';
    const pathClean = path.replace(/^\//, '');
    const namingFunction = (req) => req.url.replace(/\//g, '-');
    const store = new FileStore({ path, namingFunction});
    const handler = new DeleteHandler(store);
    const filePath = "/1234";
    const req = { headers: {}, url: path+filePath};

    beforeEach((done) => {
        res = new http.ServerResponse({ method: 'DELETE' });
        done();
    });

    describe('send()', () => {
        it('must be 404 if no file found', (done) => {
            handler.send(req, res)
                   .then(() => {
                        assert.equal(res.statusCode, 404);
                        return done();
                    })
                    .catch(done);
        });

        it('must be 404 if invalid path', (done) => {
            let new_req = Object.assign({}, req);
            new_req.url = '/test/should/not/work/1234';
            handler.send(new_req, res)
                   .then(() => {
                       assert.equal(res.statusCode, 404);
                       return done();
                   })
                   .catch(done);
        });

        it('must acknowledge successful DELETE requests with the 204', (done) => {
            fs.closeSync(fs.openSync(pathClean+filePath, 'w'));
            handler.send(req, res)
                   .then(() => {
                       assert.equal(res.statusCode, 204);
                       return done();
                   })
                   .catch(done);
        });
    });
});
