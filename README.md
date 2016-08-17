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

    Try it:
    ```sh
    $ npm run example
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
    Try it:
    ```sh
    $ npm run gcs_example
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
app.all('/files/*', function(req, res) {
  server.handle(req, res);
});
app.listen(port, host);
```

## Development

##### Start up the demo using the FileStore
```bash
$ npm run demo
```

##### Start up the demo using the GCSDataStore
```bash
$ npm run gcs_demo
```
