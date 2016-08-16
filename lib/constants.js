'use strict';

const METHODS = [
    'POST',
    'HEAD',
    'PATCH',
    'OPTIONS',
];

const HEADERS = [
    'Upload-Offset',
    'Upload-Length',
    'Upload-Defer-Length',
    'Upload-Metadata',
    'X-Requested-With',
    'Tus-Version',
    'Tus-Resumable',
    'Tus-Extension',
    'Tus-Max-Size',
    'Content-Type',
    'X-HTTP-Method-Override',
];

const HEADERS_LOWERCASE = HEADERS.map((header) => header.toLowerCase());

const ERRORS = {
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

module.exports = {
    TUS_RESUMABLE: '1.0.0',
    TUS_VERSION: ['1.0.0'],
    HEADERS,
    HEADERS_LOWERCASE,
    ALLOWED_METHODS: METHODS.join(', '),
    ALLOWED_HEADERS: HEADERS.join(', '),
    EXPOSED_HEADERS: HEADERS.join(', '),
    MAX_AGE: 86400,
    ERRORS,
};
