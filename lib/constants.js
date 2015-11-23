'use strict';

const METHODS = [
    'POST',
    'HEAD',
    'PATCH',
    'OPTIONS',
];

const HEADERS = [
    'Upload-Offset',
    'X-Requested-With',
    'Tus-Version',
    'Tus-Resumable',
    'Tus-Extension',
    'Tus-Max-Size',
    'X-HTTP-Method-Override',
];

module.exports = {
    TUS_RESUMABLE: '1.0.0',
    TUS_VERSION: ['1.0.0'],
    ALLOWED_METHODS: METHODS.join(', '),
    ALLOWED_HEADERS: HEADERS.join(', '),
    MAX_AGE: 86400,
};

