'use strict';

const Tus = require('../lib/tus');
const server = new Tus();
server.fileRoute('/files');

const host = '127.0.0.1';
const port = 8000;
server.listen({ host, port }, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port}`);
});
