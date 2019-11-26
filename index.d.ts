import { EventEmitter } from "events";
import http from 'http';

/**
 * arguments of constructor which in class extend DataStore
 */
declare interface DataStoreOptions{
    path: string;
    namingFunction?: (req : http.IncomingMessage) => string;
    relativeLocation?: string;
}

declare interface FileStoreOptions extends DataStoreOptions{
    directory?: string;
}

declare interface GCStoreOptions extends DataStoreOptions{
    bucket: string;
    projectId: string;
    keyFilename: string;
}

declare interface S3StoreOptions extends DataStoreOptions{
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    tmpDirPrefix: string;
    partSize: number;
}

declare class File{
    id: string;
    upload_length: any;
    upload_defer_length: any;
    upload_metadata: any;
    constructor(file_id: string, upload_length: any, upload_defer_length: any, upload_metadata: any);
}

/**
 * Based store for all DataStore classes.
 */
export declare class DataStore extends EventEmitter{
    constructor(options : DataStoreOptions);
    get extensions() : any;
    set extensions(extensions_array : any);
    create(req: http.IncomingMessage): Promise<any>;
    write(req: http.IncomingMessage, file_id?: string, offset?: number): Promise<any>;
    getOffset(id: string): Promise<any>;
}

/**
 * file store in local storage
 */
export declare class FileStore extends DataStore{
    constructor(options : FileStoreOptions);
    _checkOrCreateDirectory(): any;
    create(req: http.IncomingMessage): Promise<any>;
    write(req: http.IncomingMessage, file_id?: string, offset?: number): Promise<any>;
    getOffset(file_id: string): Promise<any>;
}

/**
 * file store in Google Cloud
 */
export declare class GCSDataStore extends DataStore{
    constructor(options: GCStoreOptions);
    _getBucket(): any;
    create(req: http.IncomingMessage): Promise<any>;
    write(req: http.IncomingMessage, file_id?: string, offset?: number): Promise<any>;
    getOffset(file_id: string): Promise<any>;
}

/**
 * file store in AWS S3
 */
export declare class S3Store extends DataStore {
    constructor(options : S3StoreOptions);
    _bucketExists(): Promise<any>;
    _initMultipartUpload(file: File): Promise<any>;
    _saveMetadata(file: File, upload_id: string): Promise<any>;
    _getMetadata(file_id: string): Promise<any>;
    _parseMetadataString(metadata_string: string): any;
    _uploadPart(metadata: any, read_stream: any, current_part_number: number): Promise<string>;
    _processUpload(metadata: any, req: http.IncomingMessage, current_part_number: number): Promise<number>;
    _finishMultipartUpload(metadata: any, parts: Array<any>): Promise<string>;
    _retrieveParts(file_id: string, part_number_marker: string): Promise<Array<any>>;
    _countParts(file_id: string): Promise<number>;
    _clearCache(file_id: string): any;
    create(req: http.IncomingMessage): Promise<any>;
    write(req: http.IncomingMessage, file_id?: string, offset?: number): Promise<any>;
    getOffset(file_id: string, with_parts?: boolean): Promise<any>;    
}

/**
 * Tus protocol server implements
 */
export declare class Server extends EventEmitter{
    constructor();
    get datastore() : DataStore;
    set datastore(store: DataStore);
    get(path: string, callback: Function): any;
    handle(req: http.IncomingMessage, res: http.ServerResponse): http.ServerResponse;
    listen(): http.Server;
}

export declare const ERRORS: {
    MISSING_OFFSET: {
        status_code: 403,
        body: 'Upload-Offset header required\n',
    },
    INVALID_CONTENT_TYPE: {
        status_code: 403,
        body: 'Content-Type header required\n',
    },
    FILE_NOT_FOUND: {
        status_code: 404,
        body: 'The file for this url was not found\n',
    },
    INVALID_OFFSET: {
        status_code: 409,
        body: 'Upload-Offset conflict\n',
    },
    FILE_NO_LONGER_EXISTS: {
        status_code: 410,
        body: 'The file for this url no longer exists\n',
    },
    INVALID_LENGTH: {
        status_code: 412,
        body: 'Upload-Length or Upload-Defer-Length header required\n',
    },
    UNKNOWN_ERROR: {
        status_code: 500,
        body: 'Something went wrong with that request\n',
    },
    FILE_WRITE_ERROR: {
        status_code: 500,
        body: 'Something went wrong receiving the file\n',
    },
};

declare const EVENT_ENDPOINT_CREATED = 'EVENT_ENDPOINT_CREATED';
declare const EVENT_FILE_CREATED = 'EVENT_FILE_CREATED';
declare const EVENT_UPLOAD_COMPLETE = 'EVENT_UPLOAD_COMPLETE';

export declare const EVENTS :{
    EVENT_ENDPOINT_CREATED: string,
    EVENT_FILE_CREATED: string,
    EVENT_UPLOAD_COMPLETE: string,
};
