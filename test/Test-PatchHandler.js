'use strict';

const assert = require('assert');
const should = require('should');
const http = require('http');
const PatchHandler = require('../lib/handlers/PatchHandler');
const DataStore = require('../lib/stores/DataStore');


let pluckBody = (res) => {
    return /\n(.*)$/.exec(res.output[0])[1];
}

describe('PatchHandler', () => {
    let res = null;
    let store = new DataStore({ path: '/files' });
    let handler = new PatchHandler(store);
    let req = { headers: {} };

    beforeEach((done) => {
        const METHOD = 'PATCH';
        res = new http.ServerResponse({ method: METHOD });
        done();
    });
});
