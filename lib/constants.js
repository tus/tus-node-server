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

module.exports = {
    TUS_RESUMABLE: '1.0.0',
    TUS_VERSION: ['1.0.0'],
    HEADERS,
    HEADERS_LOWERCASE,
    ALLOWED_METHODS: METHODS.join(', '),
    ALLOWED_HEADERS: HEADERS.join(', '),
    MAX_AGE: 86400,
};
