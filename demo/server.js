'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

const Server = require('../index').Server;
const FileStore = require('../index').FileStore;
const GCSDataStore = require('../index').GCSDataStore;
const S3Store = require('../index').S3Store;
const EVENTS = require('../index').EVENTS;

const server = new Server();

const data_store = process.env.DATA_STORE || 'FileStore';

switch (data_store) {
    case 'GCSDataStore':
        server.datastore = new GCSDataStore({
            path: '/files',
            projectId: 'vimeo-open-source',
            keyFilename: path.resolve(__dirname, '../keyfile.json'),
            bucket: 'tus-node-server',
        });
        break;

    case 'S3Store':
        assert.ok(process.env.AWS_ACCESS_KEY_ID, 'environment variable `AWS_ACCESS_KEY_ID` must be set');
        assert.ok(process.env.AWS_SECRET_ACCESS_KEY, 'environment variable `AWS_SECRET_ACCESS_KEY` must be set');
        assert.ok(process.env.AWS_BUCKET, 'environment variable `AWS_BUCKET` must be set');
        assert.ok(process.env.AWS_REGION, 'environment variable `AWS_REGION` must be set');

        server.datastore = new S3Store({
            path: '/files',
            bucket: process.env.AWS_BUCKET,
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION,
            partSize: 8 * 1024 * 1024, // each uploaded part will have ~8MB,
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
    console.log(`[${new Date().toLocaleTimeString()}] [EVENT HOOK] Upload complete for file ${event.file.id}`);
});

// // this is the express stile ;)
// const express = require('express');
// const app = express();
// // Define routes to serve the demo html/js files.
// app.get('/', writeFile);
// app.get('/demo/index.js', writeFile);
// app.get('/node_modules/tus-js-client/dist/tus.js', writeFile);
//
// const uploadApp = express();
// uploadApp.all('*', server.handle.bind(server));
// app.use('/uploads', uploadApp);

const host = '127.0.0.1';
const port = 8000;
server.listen({ host, port }, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port} using ${data_store}`);
});
