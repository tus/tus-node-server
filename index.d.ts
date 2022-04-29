import { EventEmitter } from "events";
import * as fs from "fs";
import http from "http";

/**
 * arguments of constructor which in class extend DataStore
 */
declare interface DataStoreOptions {
    path: string;
    namingFunction?: (req: http.IncomingMessage) => string;
    relativeLocation?: string;
}

declare interface FileStoreOptions extends DataStoreOptions {
    directory?: string;
}

declare interface GCStoreOptions extends DataStoreOptions {
    bucket: string;
    projectId: string;
    keyFilename: string;
}

declare interface S3StoreOptions extends DataStoreOptions {
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    region?: string;
    tmpDirPrefix: string;
    partSize: number;
}

declare class File {
    id: string;
    upload_length: any;
    upload_defer_length: any;
    upload_metadata: any;
    constructor(
        file_id: string,
        upload_length: any,
        upload_defer_length: any,
        upload_metadata: any
    );
}

/**
 * Based store for all DataStore classes.
 */
export declare class DataStore extends EventEmitter {
    constructor(options: DataStoreOptions);
    get extensions(): any;
    set extensions(extensions_array: any);
    create(req: Partial<http.IncomingMessage>): Promise<any>;
    write(
        req: http.IncomingMessage,
        file_id?: string,
        offset?: number
    ): Promise<any>;
    getOffset(file_id: string): Promise<any>;
}

/**
 * file store in local storage
 */
export declare class FileStore extends DataStore {
    constructor(options: FileStoreOptions);
    read(file_id: string): fs.ReadStream;
    getOffset(file_id: string): Promise<fs.Stats & File>;
}

/**
 * file store in Google Cloud
 */
export declare class GCSDataStore extends DataStore {
    constructor(options: GCStoreOptions);
}

/**
 * file store in AWS S3
 */
export declare class S3Store extends DataStore {
    constructor(options: S3StoreOptions);
    getOffset(file_id: string, with_parts?: boolean): Promise<any>;
}

/**
 * Tus protocol server implements
 */
export declare class Server extends EventEmitter {
    constructor();
    get datastore(): DataStore;
    set datastore(store: DataStore);
    get(path: string, callback: (...args) => any): any;
    handle(
        req: http.IncomingMessage,
        res: http.ServerResponse
    ): http.ServerResponse;
    listen(): http.Server;
}

export declare const EVENTS: {
    EVENT_ENDPOINT_CREATED: string;
    EVENT_FILE_CREATED: string;
    EVENT_UPLOAD_COMPLETE: string;
};

export declare const ERRORS: {
    MISSING_OFFSET: {
        status_code: number;
        body: string;
    };
    INVALID_CONTENT_TYPE: {
        status_code: number;
        body: string;
    };
    FILE_NOT_FOUND: {
        status_code: number;
        body: string;
    };
    INVALID_OFFSET: {
        status_code: number;
        body: string;
    };
    FILE_NO_LONGER_EXISTS: {
        status_code: number;
        body: string;
    };
    INVALID_LENGTH: {
        status_code: number;
        body: string;
    };
    UNKNOWN_ERROR: {
        status_code: number;
        body: string;
    };
    FILE_WRITE_ERROR: {
        status_code: number;
        body: string;
    };
};

export declare class Metadata {
    static parse(str: string): Record<string, string>;
    static stringify(metadata: Record<string, string>): string;
}
