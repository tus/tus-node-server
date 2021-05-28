'use strict';

const BaseHandler = require('./BaseHandler');
const File = require('../models/File');
const { EVENTS, ERRORS, TUS_RESUMABLE } = require('../constants');
const debug = require('debug');
const log = debug('tus-node-server:handlers:post');
class PostHandler extends BaseHandler {
    /**
     * Create a file in the DataStore.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    async send(req, res) {
        try {
            const upload_length = req.headers['upload-length'];
            const upload_defer_length = req.headers['upload-defer-length'];
            const upload_metadata = req.headers['upload-metadata'];
    
            if (upload_length === undefined && upload_defer_length === undefined) {
                throw ERRORS.INVALID_LENGTH;
            }
    
            let file_id;
            try {
                file_id = this.store.generateFileName(req);
            }
            catch (generateError) {
                log('[PostHandler]: check your namingFunction. Error', generateError);
                throw ERRORS.FILE_WRITE_ERROR;
            }
        

            const file = new File(file_id, upload_length, upload_defer_length, upload_metadata);

            let obj = await this.store.create(file)

            this.store.emit(EVENTS.EVENT_FILE_CREATED, { file: obj });

            const url = this.store.relativeLocation ? `${req.baseUrl || ''}${this.store.path}/${file.id}` : `//${req.headers.host}${req.baseUrl || ''}${this.store.path}/${file.id}`;
            this.emit(EVENTS.EVENT_ENDPOINT_CREATED, { url });
            return super.send(res, 201, { Location: url });
        }
        catch(error) {
            log('[PostHandler]', error);
            const status_code = error.status_code || ERRORS.UNKNOWN_ERROR.status_code;
            const body = error.body || `${ERRORS.UNKNOWN_ERROR.body}${error.message || ''}\n`;
            return super.send(res, status_code, {}, body);
        };
    }
}

module.exports = PostHandler;
