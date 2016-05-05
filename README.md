# tus-node-server
[![Build Status](https://travis-ci.org/tus/tus-node-server.svg?branch=master)](https://travis-ci.org/tus/tus-node-server)
[![Coverage Status](https://coveralls.io/repos/tus/tus-node-server/badge.svg?branch=master&service=github)](https://coveralls.io/github/tus/tus-node-server?branch=master)
[![Dependency Status](https://david-dm.org/tus/tus-node-server.svg)](https://david-dm.org/tus/tus-node-server#info=dependencies)

[TUS Protocol 1.0.0](http://tus.io/protocols/resumable-upload.html) Server Implementation.

## Installation

Not published yet, [coming soon](https://github.com/tus/tus-node-server/milestones/1.0%20NPM%20Publish)!

## Supported Data Stores

- Local File Storage
    ```javascript
    server.datastore = new tus.FileStore({
        path: '/files'
    });
    ```

- Google Cloud Storage
    ```javascript

    server.datastore = new tus.GCSDataStore({
        path: '/files',
        projectId: 'project-id',
        keyFilename: 'path/to/your/keyfile.json',
        bucket: 'bucket-name',
    });
    ```

- Amazon S3 ([_coming soon_](https://github.com/tus/tus-node-server/issues/12))


## Quick Start

#### Build a server
```javascript
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

#### Run the server
```bash
$ node server.js
```


#### Create a file
```bash
$ curl -X POST -I 'http://localhost:8000/files' \
               -H 'Tus-Resumable: 1.0.0' \
               -H 'Upload-Length: 12345678'

HTTP/1.1 201 Created
Tus-Resumable: 1.0.0
Location: http://localhost:8000/files/2d70739670d3304cbb8d3f2203857fef

$ curl -X PATCH -I 'http://localhost:8000/files/2d70739670d3304cbb8d3f2203857fef' \
               -H 'Tus-Resumable: 1.0.0' \
               -H 'Upload-Offset: 0'
               --upload-file path/to/file.mp4

HTTP/1.1 201 Created
Tus-Resumable: 1.0.0
Upload-Offset: 613858
```

## Running Tests
```bash
$ npm test
```

## Update Coverage
```bash
$ npm run coveralls
```
