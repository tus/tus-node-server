'use strict';

const tus = require('../index');

const server = new tus.Server();
server.datastore = new tus.FileStore({
    path: '/files',
});

const host = '127.0.0.1';
const port = 8000;
server.listen({ host, port }, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port}`);
});
