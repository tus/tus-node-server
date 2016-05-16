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

- Local File Storage
    ```javascript
    server.datastore = new tus.FileStore({
        path: '/files'
    });
    ```

- Google Cloud Storage ([_coming soon_](https://github.com/tus/tus-node-server/issues/20))
    ```javascript

    server.datastore = new tus.GCSDataStore({
        path: '/files',
        projectId: 'project-id',
        keyFilename: 'path/to/your/keyfile.json',
        bucket: 'bucket-name',
    });
    ```

- Amazon S3 ([_coming soon_](https://github.com/tus/tus-node-server/issues/12))
    ```javascript

    server.datastore = new tus.S3Store({
        path: '/files',
        bucket: 'bucket-name',
    });
    ```

## Quick Start

#### Build a standalone server
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

#### Alternatively, you could deploy tus-node-server as [Express Middleware](http://expressjs.com/en/guide/using-middleware.html)

```javascript
const tus = require('tus-node-server');
const server = new tus.Server();
server.datastore = new tus.FileStore({
    path: '/files'
});

var app = express();
app.all('/files/*', function(req, res) {
  server.handle(req, res);
});
app.listen(port, host);
```

#### Run the server
```bash
$ node server.js
```


#### Quick Upload
```bash
$ curl -X POST -I 'http://localhost:8000/files' \
               -H 'Tus-Resumable: 1.0.0' \
               -H 'Upload-Length: 12345678'

HTTP/1.1 201 Created
Tus-Resumable: 1.0.0
Location: http://localhost:8000/files/2d70739670d3304cbb8d3f2203857fef

$ curl -X PATCH -I 'http://localhost:8000/files/2d70739670d3304cbb8d3f2203857fef' \
               -H 'Tus-Resumable: 1.0.0' \
               -H 'Upload-Offset: 0' \
               -H 'Content-Type: application/offset+octet-stream' \
               --upload-file path/to/file.mp4

HTTP/1.1 201 Created
Tus-Resumable: 1.0.0
Upload-Offset: 613858
```


#### Resumable Upload
```bash

# Start with 617379340 byte file
$ ls -ln
-rw-r--r--@ 1 1369348960  1355554294  617379340 May  5 17:31 file.mp4

# Split it into two chunks
$ split -b 400000000 file.mp4 partial_file
-rw-r--r--  1 1369348960  1355554294  400000000 May  5 17:51 partial_fileaa
-rw-r--r--  1 1369348960  1355554294  217379340 May  5 17:51 partial_fileab

# Create the endpoint via POST
$ curl -X POST -I 'http://localhost:8000/files' \
               -H 'Tus-Resumable: 1.0.0' \
               -H 'Upload-Length: 617379340'

HTTP/1.1 201 Created
Tus-Resumable: 1.0.0
Location: http://localhost:8000/files/88473063b1a06f11e2eced7983d4ab2e

# Upload the first partial file
$ curl -X PATCH -I 'http://localhost:8000/files/88473063b1a06f11e2eced7983d4ab2e' \
               -H 'Tus-Resumable: 1.0.0' \
               -H 'Upload-Offset: 0' \
               -H 'Content-Type: application/offset+octet-stream' \
               -T partial_fileaa
HTTP/1.1 204 No Content
Tus-Resumable: 1.0.0
Upload-Offset: 400000000


# Check how much has been uploaded
$ curl -X HEAD -I 'http://localhost:8000/files/88473063b1a06f11e2eced7983d4ab2e' \
               -H 'Tus-Resumable: 1.0.0'
HTTP/1.1 200 OK
Tus-Resumable: 1.0.0
Upload-Offset: 400000000
Upload-Length: 617379340


# Resume the upload with the second partial file
$ 11curl -X PATCH -I 'http://localhost:8000/files/88473063b1a06f11e2eced7983d4ab2e' \
               -H 'Tus-Resumable: 1.0.0' \
               -H 'Upload-Offset: 400000000' \
               -H 'Content-Type: application/offset+octet-stream' \
               -T partial_fileab
HTTP/1.1 204 No Content
Tus-Resumable: 1.0.0
Upload-Offset: 617379340

# Check how much has been uploaded
$ curl -X HEAD -I 'http://localhost:8000/files/88473063b1a06f11e2eced7983d4ab2e' \
               -H 'Tus-Resumable: 1.0.0'
HTTP/1.1 200 OK
Tus-Resumable: 1.0.0
Upload-Offset: 617379340
Upload-Length: 617379340
```

## Running Tests
```bash
$ npm test
```

## Update Coverage
```bash
$ npm run coveralls
```
