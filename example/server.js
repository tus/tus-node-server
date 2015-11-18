'use strict';

const Tus = require('../lib/tus');
const FileStore = require('../lib/stores/filestore');
const server = new Tus();
server.datastore = new FileStore({
    path: '/files',
});

const host = '127.0.0.1';
const port = 8000;
server.listen({ host, port }, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port}`);
});
