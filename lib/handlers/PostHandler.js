'use strict';

const BaseHandler = require('./BaseHandler');
const File = require('../models/File');
const Uid = require('../models/Uid');
const RequestValidator = require('../validators/RequestValidator');
const { EVENTS, ERRORS } = require('../constants');
const debug = require('debug');
const log = debug('tus-node-server:handlers:post');
class PostHandler extends BaseHandler {

    constructor(store, options) {
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
    async send(req, res) {
        if ('upload-concat' in req.headers && !this.store.hasExtension('concatentation')) {
            throw ERRORS.UNSUPPORTED_CONCATENATION_EXTENSION;
        }

        const upload_length = req.headers['upload-length'];
        const upload_defer_length = req.headers['upload-defer-length'];
        const upload_metadata = req.headers['upload-metadata'];

        if (upload_defer_length !== undefined) {
            // Throw error if extension is not supported
            if (!this.store.hasExtension('creation-defer-length')) {
                throw ERRORS.UNSUPPORTED_CREATION_DEFER_LENGTH_EXTENSION;
            }
        }

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
            optional_headers['Upload-Offset'] = new_offset;

            if (new_offset === parseInt(upload_length, 10)) {
                this.emit(EVENTS.EVENT_UPLOAD_COMPLETE, { file: new File(file_id, file.upload_length, file.upload_defer_length, file.upload_metadata) });
            }
        }

        return this.write(res, 201, { Location: url, ...optional_headers });
    }
}

module.exports = PostHandler;
