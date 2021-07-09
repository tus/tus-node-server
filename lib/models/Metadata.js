'use strict';

/**
 * @fileOverview
 * Utility function for metdata manipulation
 *
 * @author Mitja Puzigaća <mitjap@gmail.com>
 */

const ASCII_SPACE = ' '.codePointAt(0);
const ASCII_COMMA = ','.codePointAt(0);

const BASE64_REGEX = /^[a-zA-Z0-9+/]*[=]{0,2}$/;

function validateKey(key) {
    if (key.length === 0) {
        return false;
    }

    for (let i = 0; i < key.length; ++i) {
        const charCodePoint = key.codePointAt(i);

        if (charCodePoint > 127 ||
            charCodePoint === ASCII_SPACE ||
            charCodePoint === ASCII_COMMA) {
            return false;
        }
    }

    return true;
}

function validateValue(value) {
    if (value.length % 4 !== 0) {
        return false;
    }

    return BASE64_REGEX.test(value);
}

function parse(str) {
    const meta = {};

    for (const pair of str.split(',')) {
        const tokens = pair.split(' ');
        const [key, value] = tokens;

        if ((
            (tokens.length === 1 && validateKey(key)) ||
            (tokens.length === 2 && validateKey(key) && validateValue(value))
        ) && (!(key in meta))) {
            const decodedValue = value ? Buffer.from(value, 'base64').toString('utf8') : undefined;
            meta[key] = decodedValue;
        }
        else {
            throw new Error('Metadata string is not valid');
        }
    }

    return meta;
}

function stringify(obj) {
    return Object.entries(obj).map(([key, value]) => {
        if (value === undefined) {
            return key;
        }

        const encodedValue = Buffer.from(value, 'utf8').toString('base64');
        return `${key} ${encodedValue}`;
    }).join(',');
}

module.exports = {
    parse,
    stringify,
};
