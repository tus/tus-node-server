// @ts-expect-error TS(7016): Could not find a declaration file for module 'even... Remove this comment to see the full error message
import EventEmitter from 'events';
class DataStore extends EventEmitter {
    _extensions: any;
    get extensions() {
        if (!this._extensions) {
            return null;
        }
        return this._extensions.join();
    }
    set extensions(extensions_array) {
        if (!Array.isArray(extensions_array)) {
            throw new Error('DataStore extensions must be an array');
        }
        this._extensions = extensions_array;
    }
    hasExtension(extension: any) {
        return this._extensions && this._extensions.indexOf(extension) !== -1;
    }
    /**
     * Called in POST requests. This method just creates a
     * file, implementing the creation extension.
     *
     * http://tus.io/protocols/resumable-upload.html#creation
     *
     * @param  {File} file
     * @return {Promise} offset
     */
    async create(file: any) {
        return file;
    }
    /**
     * Called in DELETE requests. This method just deletes the file from the store.
     * http://tus.io/protocols/resumable-upload.html#termination
     *
     * @param {string} file_id Name of the file
     * @return {Promise}
     */
    async remove(file_id: any) {
    }
    /**
     * Called in PATCH requests. This method should write data
     * to the DataStore file, and possibly implement the
     * concatenation extension.
     *
     * http://tus.io/protocols/resumable-upload.html#concatenation
     *
     * @param {object} stream stream.Readable
     * @param {string} file_id Name of file
     * @param {integer} offset starting offset
     * @return {Promise}
     */
    async write(stream: any, file_id: any, offset: any) {
        return 0;
    }
    /**
     * Called in HEAD requests. This method should return the bytes
     * writen to the DataStore, for the client to know where to resume
     * the upload.
     *
     * @param {string} file_id Name of file
     * @return {Promise} bytes written
     */
    async getOffset(file_id: any) {
        return { size: 0, upload_length: 0 };
    }
    /**
     * Called in PATCH requests when upload length is known after being defered.
     *
     * @param {string} file_id Name of file
     * @param {number} upload_length Declared upload length
     * @return {Promise}
     */
    async declareUploadLength(file_id: any, upload_length: any) {
    }
}
export default DataStore;
