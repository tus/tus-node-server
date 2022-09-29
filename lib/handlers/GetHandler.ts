// @ts-expect-error TS(2307): Cannot find module 'stream' or its corresponding t... Remove this comment to see the full error message
import stream from 'stream';
import BaseHandler from './BaseHandler';
import { ERRORS as ERRORS$0 } from '../constants';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'debu... Remove this comment to see the full error message
import * as debug from 'debug';
const ERRORS = { ERRORS: ERRORS$0 }.ERRORS;
const log = debug('tus-node-server:handlers:get');
class GetHandler extends BaseHandler {
    paths: any;
    constructor(store: any, options: any) {
        super(store, options);
        this.paths = new Map();
    }
    registerPath(path: any, handler: any) {
        this.paths.set(path, handler);
    }
    /**
     * Read data from the DataStore and send the stream.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    async send(req: any, res: any) {
        // Check if this url has been added to allow GET requests, with an
        // appropriate callback to handle the request
        if (this.paths.has(req.url)) {
            // invoke the callback
            return this.paths.get(req.url)(req, res);
        }
        if (!('read' in this.store)) {
            throw ERRORS.FILE_NOT_FOUND;
        }
        const file_id = this.getFileIdFromRequest(req);
        if (file_id === false) {
            throw ERRORS.FILE_NOT_FOUND;
        }
        const stats = await this.store.getOffset(file_id);
        const upload_length = parseInt(stats.upload_length, 10);
        if (stats.size !== upload_length) {
            log(`[GetHandler] send: File is not yet fully uploaded (${stats.size}/${upload_length})`);
            throw ERRORS.FILE_NOT_FOUND;
        }
        const file_stream = this.store.read(file_id);
        const headers = {
            'Content-Length': stats.size,
        };
        res.writeHead(200, headers);
        return stream.pipeline(file_stream, res, (err: any) => {
            // we have no need to handle streaming errors
        });
    }
}
export default GetHandler;
