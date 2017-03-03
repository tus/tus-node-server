'use strict';

const path = require('path');
const fs = require('fs');

const Server = require('../index').Server;
const FileStore = require('../index').FileStore;
const GCSDataStore = require('../index').GCSDataStore;
const GCSResumableStore = require('../index').GCSResumableStore;
const EVENTS = require('../index').EVENTS;

const server = new Server();

const data_store = process.env.DATA_STORE || 'FileStore';

switch (data_store) {
    case 'GCSDataStore':
        server.datastore = new GCSDataStore({
            path: '/files',
            projectId: 'hangar-406b5',
            keyFilename: path.resolve(__dirname, '../keyfile-dev.json'),
            bucket: 'console-uploads',
        });
        break;
    case 'GCSResumableStore':
        server.datastore = new GCSResumableStore({
            path: '/files',
            projectId: 'hangar-406b5',
            keyFilename: path.resolve(__dirname, '../keyfile-dev.json'),
            bucket: 'console-uploads',
        });
        break;

    default:
        server.datastore = new FileStore({
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

server.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
    console.log(`[${new Date().toLocaleTimeString()}] [EVENT HOOK] Upload complete for file ${event.file.id} (upload-metadata [base64] values ='${event.file.upload_metadata}')`);
});

const host = '127.0.0.1';
const port = 8000;
server.listen({ host, port }, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port} using ${data_store}`);
});
