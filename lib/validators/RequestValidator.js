'use strict';
/**
 * @fileOverview
 * Centralize all header validation in one place.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */


const CONSTANTS = require('../constants');

class RequestValidator {

    // All PATCH requests MUST include a Upload-Offset header
    static _invalidUploadOffsetHeader(value) {
        return isNaN(value) || parseInt(value, 10) < 0;
    }

    // The value MUST be a non-negative integer.
    static _invalidUploadLengthHeader(value) {
        return isNaN(value) || parseInt(value, 10) < 0;
    }

    // The Upload-Defer-Length value MUST be 1.
    static _invalidUploadDeferLengthHeader(value) {
        return isNaN(value) || parseInt(value, 10) !== 1;
    }

    // The Upload-Metadata request and response header MUST consist of one
    // or more comma-separated key-value pairs. The key and value MUST be
    // separated by a space. The key MUST NOT contain spaces and commas and
    // MUST NOT be empty. The key SHOULD be ASCII encoded and the value MUST
    // be Base64 encoded. All keys MUST be unique.
    static _invalidUploadMetadataHeader(value) {
        const keypairs = value.split(',')
                              .map((keypair) => keypair.trim());

        return keypairs.some((keypair) => keypair.split(' ').length !== 2);
    }

    static _invalidXRequestedWithHeader() {
        return false;
    }

    static _invalidTusVersionHeader(value) {
        return CONSTANTS.TUS_VERSION.indexOf(value) === -1;
    }

    static _invalidTusResumableHeader(value) {
        return value !== CONSTANTS.TUS_RESUMABLE;
    }

    static _invalidTusExtensionHeader(value) {
        return false;
    }

    static _invalidTusMaxSizeHeader() {
        return false;
    }

    static _invalidXHttpMethodOverrideHeader() {
        return false;
    }

    // All PATCH requests MUST use Content-Type: application/offset+octet-stream.
    static _invalidContentTypeHeader(value) {
        return value !== 'application/offset+octet-stream';
    }

    static _invalidAuthorizationHeader() {
        return false;
    }

    static capitalizeHeader(header_name) {
        return header_name.replace(/\b[a-z]/g, function() {
            return arguments[0].toUpperCase();
        }).replace(/-/g, '');
    }

    static isInvalidHeader(header_name, header_value) {
        if (CONSTANTS.HEADERS_LOWERCASE.indexOf(header_name) === -1) {
            return false;
        }

        const method = `_invalid${this.capitalizeHeader(header_name)}Header`;
        return this[method](header_value);
    }
}

module.exports = RequestValidator;
