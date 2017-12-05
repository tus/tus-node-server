# tus-node-server
[![npm version](https://badge.fury.io/js/tus-node-server.svg)](https://badge.fury.io/js/tus-node-server)
[![Build Status](https://travis-ci.org/tus/tus-node-server.svg?branch=master)](https://travis-ci.org/tus/tus-node-server)
[![Coverage Status](https://coveralls.io/repos/tus/tus-node-server/badge.svg?branch=master&service=github)](https://coveralls.io/github/tus/tus-node-server?branch=master)
[![Dependency Status](https://david-dm.org/tus/tus-node-server.svg)](https://david-dm.org/tus/tus-node-server#info=dependencies)

tus is a new open protocol for resumable uploads built on HTTP. This is the [tus protocol 1.0.0](http://tus.io/protocols/resumable-upload.html) node.js server implementation.

## Installation

```bash
$ npm install tus-node-server
```

## Flexible Data Stores

- **Local File Storage**
    ```js
    server.datastore = new tus.FileStore({
        path: '/files'
    });
    ```

- **Google Cloud Storage**
    ```js

    server.datastore = new tus.GCSDataStore({
        path: '/files',
        projectId: 'project-id',
        keyFilename: 'path/to/your/keyfile.json',
        bucket: 'bucket-name',
    });
    ```

- **Amazon S3** ([_coming soon_](https://github.com/tus/tus-node-server/issues/12))
    ```js

    server.datastore = new tus.S3Store({
        path: '/files',
        bucket: 'bucket-name',
    });
    ```

## Quick Start

#### Use the [tus-node-deploy](https://hub.docker.com/r/bhstahl/tus-node-deploy/) Docker image

```sh
$ docker run -p 49160:8080 -d bhstahl/tus-node-deploy
```

#### Build a standalone server yourself
```js
const tus = require('tus-node-server');

const server = new tus.Server();
server.datastore = new tus.FileStore({
    path: '/files'
});

const host = '127.0.0.1';
const port = 8000;
server.listen({ host, port }, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port}`);
});
```

#### Use tus-node-server as [Express Middleware](http://expressjs.com/en/guide/using-middleware.html)

```js
const tus = require('tus-node-server');
const server = new tus.Server();
server.datastore = new tus.FileStore({
    path: '/files'
});

var app = express();
const uploadApp = express();
uploadApp.all('*', server.handle.bind(server));
app.use('/uploads', uploadApp);
app.listen(port, host);
```

## Features
#### Events:

Execute code when lifecycle events happen by adding event handlers to your server.

```js
const Server = require('tus-node-server').Server;
const EVENTS = require('tus-node-server').EVENTS;

const server = new Server();
server.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
    console.log(`Upload complete for file ${event.file.id}`);
});
```

- `EVENT_FILE_CREATED`: Fired when a `POST` request successfully creates a new file

    _Example payload:_
    ```
    {
        file: {
            id: '7b26bf4d22cf7198d3b3706bf0379794',
            upload_length: '41767441',
            upload_metadata: 'filename NDFfbWIubXA0'
         }
    }
    ```

- `EVENT_ENDPOINT_CREATED`: Fired when a `POST` request successfully creates a new upload endpoint

    _Example payload:_
    ```
    {
        url: 'http://localhost:8000/files/7b26bf4d22cf7198d3b3706bf0379794'
    }
    ```

- `EVENT_UPLOAD_COMPLETE`: Fired when a `PATCH` request finishes writing the file

    _Example payload:_
    ```
    {
        file: {
            id: '7b26bf4d22cf7198d3b3706bf0379794',
            upload_length: '41767441',
            upload_metadata: 'filename NDFfbWIubXA0'
        }
    }
    ```

#### Custom `GET` handlers:
Add custom `GET` handlers to suit your needs, similar to [Express routing](https://expressjs.com/en/guide/routing.html).
```js
const server = new Server();
server.get('/uploads', (req, res) => {
    // Read from your DataStore
    fs.readdir(server.datastore.path, (err, files) => {
        // Format the JSON response and send it
    }
});
```

#### Custom file names:
```js
const fileNameFromUrl = (req) => {
    return req.url.replace(/\//g, '-');
}

server.datastore = new tus.FileStore({
    path: '/files',
    namingFunction: fileNameFromUrl
});
```

## Development

Start the demo server using Local File Storage
```bash
$ npm run demo
```

Or start up the demo server using Google Cloud Storage
```bash
$ npm run gcs_demo
```

Then navigate to the demo ([localhost:8000](http://localhost:8000)) which uses [`tus-js-client`](https://github.com/tus/tus-js-client)
