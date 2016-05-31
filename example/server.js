'use strict';

const tus = require('../index');
const path = require('path');

const server = new tus.Server();

const data_store = process.env.DATA_STORE || 'FileStore';

switch (data_store) {
    case 'GCSDataStore':
        server.datastore = new tus.GCSDataStore({
            path: '/files',
            projectId: 'vimeo-open-source',
            keyFilename: path.resolve(__dirname, '../test/keyfile.json'),
            bucket: 'tus-node-server',
        });
        break;

    default:
        server.datastore = new tus.FileStore({
            path: '/files',
        });
}

const host = '127.0.0.1';
const port = 8000;
server.listen({ host, port }, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port} using ${data_store}`);
});
