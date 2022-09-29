import BaseHandler from './BaseHandler';
import File from '../models/File';
import Uid from '../models/Uid';
import RequestValidator from '../validators/RequestValidator';
import { EVENTS, ERRORS } from '../constants';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'debu... Remove this comment to see the full error message
import * as debug from 'debug';
const log = debug('tus-node-server:handlers:post');
class PostHandler extends BaseHandler {
    emit: any;
    constructor(store: any, options: any) {
        if (options.namingFunction && typeof options.namingFunction !== 'function') {
            throw new Error('\'namingFunction\' must be a function');
        }
        if (!options.namingFunction) {
            options.namingFunction = Uid.rand;
        }
        super(store, options);
    }
    /**
     * Create a file in the DataStore.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    async send(req: any, res: any) {
        if ('upload-concat' in req.headers && !this.store.hasExtension('concatentation')) {
            throw ERRORS.UNSUPPORTED_CONCATENATION_EXTENSION;
        }
        const upload_length = req.headers['upload-length'];
        const upload_defer_length = req.headers['upload-defer-length'];
        const upload_metadata = req.headers['upload-metadata'];
        if ((upload_length === undefined) === (upload_defer_length === undefined)) {
            throw ERRORS.INVALID_LENGTH;
        }
        let file_id;
        try {
            file_id = this.options.namingFunction(req);
        }
        catch (err) {
            log('create: check your `namingFunction`. Error', err);
            throw ERRORS.FILE_WRITE_ERROR;
        }
        const file = new File(file_id, upload_length, upload_defer_length, upload_metadata);
        const obj = await this.store.create(file);
        this.emit(EVENTS.EVENT_FILE_CREATED, { file: obj });
        const url = this.generateUrl(req, file.id);
        this.emit(EVENTS.EVENT_ENDPOINT_CREATED, { url });
        const optional_headers = {};
        // The request MIGHT include a Content-Type header when using creation-with-upload extension
        if (!RequestValidator.isInvalidHeader('content-type', req.headers['content-type'])) {
            const new_offset = await this.store.write(req, file.id, 0);
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            optional_headers['Upload-Offset'] = new_offset;
        }
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 3.
        return this.write(res, 201, { Location: url, ...optional_headers });
    }
}
export default PostHandler;
