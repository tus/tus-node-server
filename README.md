# tus-node-server
[![npm version](https://badge.fury.io/js/tus-node-server.svg)](https://badge.fury.io/js/tus-node-server)
[![Build Status](https://github.com/tus/tus-node-server/actions/workflows/ci.yml/badge.svg)](https://github.com/tus/tus-node-server/actions/workflows/ci.yml)

tus is a new open protocol for resumable uploads built on HTTP. This is the [tus protocol 1.0.0](http://tus.io/protocols/resumable-upload.html) node.js server implementation.

## Installation

```bash
$ npm install tus-node-server
```

## Flexible Data Stores

- **Local File Storage**
    ```js
    server.datastore = new tus.FileStore({
        directory: './files'
    });
    ```

- **Google Cloud Storage**
    ```js

    server.datastore = new tus.GCSDataStore({
        projectId: 'project-id',
        keyFilename: 'path/to/your/keyfile.json',
        bucket: 'bucket-name',
    });
    ```

- **Amazon S3**
    
    using Key/Secret
    ```js

    server.datastore = new tus.S3Store({
        bucket: 'bucket-name',
        accessKeyId: 'access-key-id',
        secretAccessKey: 'secret-access-key',
        region: 'eu-west-1',
        partSize: 8 * 1024 * 1024, // each uploaded part will have ~8MB,
    });
    ```

    using [credentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Credentials.html#constructor-property) to fetch credentials inside a AWS container, such as an ECS container, which will inject the required environment variables. The `credentials` config is directly passed into the AWS SDK so you can refer to the AWS docs for the supported values for `credentials`.
    
    For example, with `ECSCredentials`:
    
    ```js
    server.datastore = new tus.S3Store({
        path: '/files',
        bucket: 'bucket-name',
        credentials: new AWS.ECSCredentials({
            httpOptions: { timeout: 5000 },
            maxRetries: 10,
        }),
        region: 'eu-west-1',
        partSize: 8 * 1024 * 1024, // each uploaded part will have ~8MB,
        tmpDirPrefix: 'tus-s3-store',
    });
    ```
## Quick Start

#### Use the [tus-node-deploy](https://hub.docker.com/r/bhstahl/tus-node-deploy/) Docker image

```sh
$ docker run -p 1080:8080 -d bhstahl/tus-node-deploy
```

#### Build a standalone server yourself
```js
const tus = require('tus-node-server');

const server = new tus.Server({ path: '/files' });
server.datastore = new tus.FileStore({ directory: './files' });

const host = '127.0.0.1';
const port = 1080;
server.listen({ host, port }, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port}`);
});
```

#### Use tus-node-server as [Express Middleware](http://expressjs.com/en/guide/using-middleware.html)

```js
const tus = require('tus-node-server');
const server = new tus.Server({ path: '/files' });
server.datastore = new tus.FileStore({ directory: './files' });

const express = require('express');
const app = express();
const uploadApp = express();
uploadApp.all('*', server.handle.bind(server));
app.use('/uploads', uploadApp);

const host = '127.0.0.1';
const port = 1080;
app.listen(port, host);
```

#### Use tus-node-server with [Koa](https://github.com/koajs/koa) or plain Node server

```js
const http = require('http');
const url = require('url');
const Koa = require('koa')
const tus = require('tus-node-server');

const tusServer = new tus.Server({ path: '/files' });
tusServer.datastore = new tus.FileStore({ directory: './files' });

const app = new Koa();
const appCallback = app.callback();
const port = 1080;


const server = http.createServer((req, res) => {
    const urlPath = url.parse(req.url).pathname;

    // handle any requests with the `/files/*` pattern
    if (/^\/files\/.+/.test(urlPath.toLowerCase())) {
        return tusServer.handle(req, res);
    }

    appCallback(req, res);
});

server.listen(port)
```

#### Use tus-node-server with [Fastify](https://www.fastify.io)

```js
const tus = require('tus-node-server');
const tusServer = new tus.Server({ path: '/files' });
tusServer.datastore = new tus.FileStore({ directory: './files' });

const fastify = require('fastify')({ logger: true });

/**
 * add new content-type to fastify forewards request
 * without any parser to leave body untouched
 * @see https://www.fastify.io/docs/latest/Reference/ContentTypeParser/
 */
fastify.addContentTypeParser(
    'application/offset+octet-stream', (request, payload, done) => done(null)
);

/**
 * let tus handle preparation and filehandling requests
 * fastify exposes raw nodejs http req/res via .raw property
 * @see https://www.fastify.io/docs/latest/Reference/Request/
 * @see https://www.fastify.io/docs/latest/Reference/Reply/#raw
 */
fastify.all('/files', (req, res) => {
    tusServer.handle(req.raw, res.raw);
});
fastify.all('/files/*', (req, res) => {
    tusServer.handle(req.raw, res.raw);
});

fastify.listen(3000, (err) => {
    if (err) {
        fastify.log.error(err);
        process.exit(1);
    }
});
```

## Features
#### Events:

Execute code when lifecycle events happen by adding event handlers to your server.

```js
const tus = require('tus-node-server');
const EVENTS = require('tus-node-server').EVENTS;

const server = new tus.Server({ path: '/files' });
server.datastore = new tus.FileStore({ directory: './files' });

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
        url: 'http://localhost:1080/files/7b26bf4d22cf7198d3b3706bf0379794'
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

- `EVENT_FILE_DELETED`: Fired when a `DELETE` request finishes deleting the file

    _Example payload:_
    ```
    {
        file_id: '7b26bf4d22cf7198d3b3706bf0379794'

    }
    ```

#### Custom `GET` handlers:
Add custom `GET` handlers to suit your needs, similar to [Express routing](https://expressjs.com/en/guide/routing.html).
```js
const server = new tus.Server({ path: '/files' });
server.datastore = new tus.FileStore({ directory: './files' });

server.get('/uploads', (req, res) => {
    // Read from your DataStore
    fs.readdir(server.datastore.directory, (err, files) => {
        // Format the JSON response and send it
    }
});
```

#### Custom file names:

The default naming of files is a random crypto hex string. When using your own `namingFunction`, make sure to create URL friendly names such as removing spaces.
```js
const crypto = require('crypto');

// req is http.IncomingMessage
const randomString = (req) => {
    // same as the default implementation
    return crypto.randomBytes(16).toString('hex');
}

const server = new tus.Server({
    path: '/files',
    namingFunction: randomString,
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

Then navigate to the demo ([localhost:1080](http://localhost:1080)) which uses [`tus-js-client`](https://github.com/tus/tus-js-client)
