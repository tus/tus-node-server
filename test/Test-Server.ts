// @ts-expect-error TS(7016): Could not find a declaration file for module 'supe... Remove this comment to see the full error message
import request from 'supertest';
// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'node:assert/strict';
// @ts-expect-error TS(2307): Cannot find module 'http' or its corresponding typ... Remove this comment to see the full error message
import http from 'http';
import should from 'should';
import Server from '../lib/Server';
import FileStore from '../lib/stores/FileStore';
import DataStore from '../lib/stores/DataStore';
import { TUS_RESUMABLE as TUS_RESUMABLE$0 } from '../lib/constants';
import { EVENTS as EVENTS$0 } from '../lib/constants';
const TUS_RESUMABLE = { TUS_RESUMABLE: TUS_RESUMABLE$0 }.TUS_RESUMABLE;
const EVENTS = { EVENTS: EVENTS$0 }.EVENTS;
const hasHeader = (res: any, header: any) => {
    const key = Object.keys(header)[0];
    return res._header.indexOf(`${key}: ${header[key]}`) > -1;
};
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Server', () => {
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('instantiation', () => {
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('constructor must require options', () => {
            assert.throws(() => {
                // @ts-expect-error TS(2554): Expected 1 arguments, but got 0.
                new Server();
            }, Error);
            assert.throws(() => {
                new Server({});
            }, Error);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should accept valid options', () => {
            assert.doesNotThrow(() => {
                new Server({ path: '/files' });
            });
            assert.doesNotThrow(() => {
                new Server({ path: '/files', namingFunction: () => {
                    return '1234';
                } });
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should throw on invalid namingFunction', () => {
            assert.throws(() => {
                const server = new Server({ path: '/files', namingFunction: '1234' });
                server.datastore = new DataStore();
            }, Error);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('setting the DataStore should attach handlers', (done: any) => {
            const server = new Server({ path: '/files' });
            server.handlers.should.be.empty();
            server.datastore = new DataStore();
            server.handlers.should.have.property('HEAD');
            server.handlers.should.have.property('OPTIONS');
            server.handlers.should.have.property('POST');
            server.handlers.should.have.property('PATCH');
            server.handlers.should.have.property('DELETE');
            done();
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('listen', () => {
        let server: any;
        // @ts-expect-error TS(2304): Cannot find name 'before'.
        before(() => {
            server = new Server({ path: '/test/output' });
            server.datastore = new DataStore();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should create an instance of http.Server', (done: any) => {
            const new_server = server.listen();
            assert.equal(new_server instanceof http.Server, true);
            new_server.close();
            done();
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('get', () => {
        let server;
        let listener: any;
        // @ts-expect-error TS(2304): Cannot find name 'before'.
        before(() => {
            server = new Server({ path: '/test/output' });
            server.datastore = new DataStore();
            server.get('/some_url', (req: any, res: any) => {
                res.writeHead(200);
                res.write('Hello world!\n');
                res.end();
            });
            listener = server.listen();
        });
        // @ts-expect-error TS(2304): Cannot find name 'after'.
        after(() => {
            listener.close();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should respond to user implemented GET requests', (done: any) => {
            request(listener)
                .get('/some_url')
                .expect(200, 'Hello world!\n', done);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 404 non-user implemented GET requests', (done: any) => {
            request(listener)
                .get('/not_here')
                .expect(404, {}, done);
        });
    });
    // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
    describe('handle', () => {
        let server: any;
        let listener: any;
        // @ts-expect-error TS(2304): Cannot find name 'before'.
        before(() => {
            server = new Server({ path: '/test/output' });
            server.datastore = new FileStore({
                directory: './test/output',
            });
            listener = server.listen();
        });
        // @ts-expect-error TS(2304): Cannot find name 'after'.
        after(() => {
            listener.close();
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('should 412 !OPTIONS requests without the Tus header', (done: any) => {
            request(listener)
                .post('/')
                .expect(412, 'Tus-Resumable Required\n', done);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('OPTIONS should return configuration', (done: any) => {
            request(listener)
                .options('/')
                .expect(204, '', (err: any, res: any) => {
                    res.headers.should.have.property('access-control-allow-methods');
                    res.headers.should.have.property('access-control-allow-headers');
                    res.headers.should.have.property('access-control-max-age');
                    res.headers.should.have.property('tus-resumable');
                    res.headers['tus-resumable'].should.equal(TUS_RESUMABLE);
                    done(err);
                });
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('HEAD should 404 non files', (done: any) => {
            request(listener)
                .head('/')
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(404, {}, done);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('POST should require Upload-Length header', (done: any) => {
            request(listener)
                .post(server.options.path)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(400, {}, done);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('POST should require non negative Upload-Length number', (done: any) => {
            request(listener)
                .post(server.options.path)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Length', -3)
                .expect(400, 'Invalid upload-length\n', done);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('POST should validate the metadata header', (done: any) => {
            request(listener)
                .post(server.options.path)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Metadata', '')
                .expect(400, 'Invalid upload-metadata\n', done);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('DELETE should return 404 when file does not exist', (done: any) => {
            request(server.listen())
                .delete(`${server.options.path}/123`)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(404, 'The file for this url was not found\n', done);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('DELETE should return 404 on invalid paths', (done: any) => {
            request(server.listen())
                .delete('/this/is/wrong/123')
                .set('Tus-Resumable', TUS_RESUMABLE)
                .expect(404, 'The file for this url was not found\n', done);
        });
        // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
        it('DELETE should return 204 on proper deletion', (done: any) => {
            request(server.listen())
                .post(server.options.path)
                .set('Tus-Resumable', TUS_RESUMABLE)
                .set('Upload-Length', 12345678)
                .then((res: any) => {
                    request(server.listen())
                        .delete(res.headers.location)
                        .set('Tus-Resumable', TUS_RESUMABLE)
                        .expect(204, done);
                });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('POST should ignore invalid Content-Type header', (done: any) => {
                request(listener)
                    .post(server.options.path)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Length', 300)
                    .set('Upload-Metadata', 'foo aGVsbG8=, bar d29ynGQ=')
                    .set('Content-Type', 'application/false')
                    .expect(201, {}, (err: any, res: any) => {
                        res.headers.should.have.property('location');
                        done(err);
                    });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should 404 other requests', (done: any) => {
                request(listener)
                    .get('/')
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .expect(404, {}, done);
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should allow overriding the HTTP method', (done: any) => {
                const req = { headers: { 'x-http-method-override': 'OPTIONS' }, method: 'GET' };
                const res = new http.ServerResponse({ method: 'OPTIONS' });
                server.handle(req, res);
                assert.equal(req.method, 'OPTIONS');
                done();
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should allow overriding the HTTP method', (done: any) => {
                const origin = 'vimeo.com';
                const req = { headers: { origin }, method: 'OPTIONS', url: '/' };
                const res = new http.ServerResponse({ method: 'OPTIONS' });
                server.handle(req, res);
                assert.equal(hasHeader(res, {
                    'Access-Control-Allow-Origin': origin,
                }), true);
                done();
            });
        });
        // @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
        describe('hooks', () => {
            let server: any;
            let listener: any;
            // @ts-expect-error TS(2304): Cannot find name 'beforeEach'.
            beforeEach(() => {
                server = new Server({ path: '/test/output' });
                server.datastore = new FileStore({
                    directory: './test/output',
                });
                listener = server.listen();
            });
            // @ts-expect-error TS(2304): Cannot find name 'afterEach'.
            afterEach(() => {
                listener.close();
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should fire when an endpoint is created', (done: any) => {
                server.on(EVENTS.EVENT_ENDPOINT_CREATED, (event: any) => {
                    event.should.have.property('url');
                    done();
                });
                request(listener)
                    .post(server.options.path)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Length', 12345678)
                    .end((err: any) => {
                        if (err) {
                            done(err);
                        }
                    });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should fire when a file is created', (done: any) => {
                server.on(EVENTS.EVENT_FILE_CREATED, (event: any) => {
                    event.should.have.property('file');
                    done();
                });
                request(listener)
                    .post(server.options.path)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Length', 12345678)
                    .end((err: any) => {
                        if (err) {
                            done(err);
                        }
                    });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should fire when a file is deleted', (done: any) => {
                server.on(EVENTS.EVENT_FILE_DELETED, (event: any) => {
                    event.should.have.property('file_id');
                    done();
                });
                request(server.listen())
                    .post(server.options.path)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Length', 12345678)
                    .then((res: any) => {
                        request(server.listen())
                            .delete(res.headers.location)
                            .set('Tus-Resumable', TUS_RESUMABLE)
                            .end((err: any) => {
                                if (err) {
                                    done(err);
                                }
                            });
                    });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should fire when an upload is finished', (done: any) => {
                server.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event: any) => {
                    event.should.have.property('file');
                    done();
                });
                request(server.listen())
                    .post(server.options.path)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    // @ts-expect-error TS(2580): Cannot find name 'Buffer'. Do you need to install ... Remove this comment to see the full error message
                    .set('Upload-Length', Buffer.byteLength('test', 'utf8'))
                    .then((res: any) => {
                        request(server.listen())
                            .patch(res.headers.location)
                            .send('test')
                            .set('Tus-Resumable', TUS_RESUMABLE)
                            .set('Upload-Offset', 0)
                            // @ts-expect-error TS(2580): Cannot find name 'Buffer'. Do you need to install ... Remove this comment to see the full error message
                            .set('Upload-Length', Buffer.byteLength('test', 'utf8'))
                            .set('Content-Type', 'application/offset+octet-stream')
                            .end((err: any) => {
                                if (err) {
                                    done(err);
                                }
                            });
                    });
            });
            // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
            it('should fire when an upload is finished with upload-defer-length', (done: any) => {
                server.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event: any) => {
                    event.should.have.property('file');
                    done();
                });
                request(server.listen())
                    .post(server.options.path)
                    .set('Tus-Resumable', TUS_RESUMABLE)
                    .set('Upload-Defer-Length', 1)
                    .then((res: any) => {
                        request(server.listen())
                            .patch(res.headers.location)
                            .send('test')
                            .set('Tus-Resumable', TUS_RESUMABLE)
                            .set('Upload-Offset', 0)
                            // @ts-expect-error TS(2580): Cannot find name 'Buffer'. Do you need to install ... Remove this comment to see the full error message
                            .set('Upload-Length', Buffer.byteLength('test', 'utf8'))
                            .set('Content-Type', 'application/offset+octet-stream')
                            .end((err: any) => {
                                if (err) {
                                    done(err);
                                }
                            });
                    });
            });
        });
    });
});
