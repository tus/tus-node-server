'use strict';

const tus = require('../index');
const path = require('path');
const fs = require('fs');

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

/**
 * Basic GET handler to serve the demo html/js
 *
 * @param  {object} req http.incomingMessage
 * @param  {object} res http.ServerResponse
 */
const writeFile = (req, res) => {
    const filename = req.url === '/' ? 'demo/index.html' : req.url;
    const filepath = path.join(process.cwd(), filename);
    fs.readFile(filepath, 'binary', (err, file) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.write(err);
            res.end();
            return;
        }

        res.writeHead(200);
        res.write(file);
        res.end();
    });
};

// Define routes to serve the demo html/js files.
server.get('/', writeFile);
server.get('/demo/index.js', writeFile);
server.get('/node_modules/tus-js-client/dist/tus.js', writeFile);

const host = '127.0.0.1';
const port = 8000;
server.listen({ host, port }, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port} using ${data_store}`);
});
