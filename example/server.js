'use strict';

let Tus = require('../lib/tus');

let server = new Tus();

server.route('/', ['GET'], (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write(`Hello tus!`);
    res.end();
});

server.route('/upload', ['PATCH'], (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write(`Uploading`);
    res.end();
});

const TIMEOUT = 30000;
server.timeout = TIMEOUT;

const port = 8000;
const host = '127.0.0.1';
let server_options = { host, port };

server.listen(server_options, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port}`);
});
