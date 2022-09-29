import BaseHandler from "./BaseHandler.js";
import File from "../models/File.js";
import { ERRORS, EVENTS } from "../constants.js";
import * as debug from "debug";
const log = debug('tus-node-server:handlers:patch');
class PatchHandler extends BaseHandler {
    /**
     * Write data to the DataStore and return the new offset.
     *
     * @param  {object} req http.incomingMessage
     * @param  {object} res http.ServerResponse
     * @return {function}
     */
    async send(req, res) {
        const file_id = this.getFileIdFromRequest(req);
        if (file_id === false) {
            throw ERRORS.FILE_NOT_FOUND;
        }
        // The request MUST include a Upload-Offset header
        let offset = req.headers['upload-offset'];
        if (offset === undefined) {
            throw ERRORS.MISSING_OFFSET;
        }
        offset = parseInt(offset, 10);
        // The request MUST include a Content-Type header
        const content_type = req.headers['content-type'];
        if (content_type === undefined) {
            throw ERRORS.INVALID_CONTENT_TYPE;
        }
        // The request MUST validate upload-length related headers
        const upload_length = req.headers['upload-length'];
        const upload_defer_length = req.headers['upload-defer-length'];
        if ((upload_length === undefined) === (upload_defer_length === undefined)) {
            throw ERRORS.INVALID_LENGTH;
        }
        const file = await this.store.getOffset(file_id);
        if (file.size !== offset) {
            // If the offsets do not match, the Server MUST respond with the 409 Conflict status without modifying the upload resource.
            log(`[PatchHandler] send: Incorrect offset - ${offset} sent but file is ${file.size}`);
            throw ERRORS.INVALID_OFFSET;
        }
        // Throw error is upload-length header does not match current upload-length if it is set.
        if (upload_length !== undefined && file.upload_length !== undefined && upload_length !== file.upload_length) {
            throw ERRORS.INVALID_LENGTH;
        }
        // Throw error is upload-defer-length header is present while upload-length is already known
        else if (upload_defer_length !== undefined && file.upload_length !== undefined) {
            throw ERRORS.INVALID_LENGTH;
        }
        // Declare upload-length if it is not already known
        if (upload_length !== undefined && file.upload_length === undefined) {
            await this.store.declareUploadLength(file_id, upload_length);
        }
        const new_offset = await this.store.write(req, file_id, offset);
        if (parseInt(new_offset, 10) === parseInt(upload_length, 10)) {
            this.emit(EVENTS.EVENT_UPLOAD_COMPLETE, { file: new File(file_id, file.upload_length, file.upload_defer_length, file.upload_metadata) });
        }
        //  It MUST include the Upload-Offset header containing the new offset.
        const headers = {
            'Upload-Offset': new_offset,
        };
        // The Server MUST acknowledge successful PATCH requests with the 204
        return this.write(res, 204, headers);
    }
}
export default PatchHandler;
