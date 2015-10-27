# tus-node-server
[TUS Protocol 1.0.0](http://tus.io/protocols/resumable-upload.html) Server Implementation.

## Installation

```bash
$ npm install tus-node-server
```

## Quick Start

#### Build the server
```javascript
const Tus = require('../lib/tus');
const server = new Tus();
server.fileRoute('/files');

const host = '127.0.0.1';
const port = 8000;
server.listen({ host, port }, () => {
    console.log(`tus server listening at http://${host}:${port}`);
});
```

#### Run the server
```bash
$ node example/server.js
```


#### Create a file
```bash
$ curl -X POST -I 'http://localhost:8000/files' \
               -H 'Tus-Resumable: 1.0.0' \
               -H 'Entity-Length: 12345678'

HTTP/1.1 201 Created
Tus-Resumable: 1.0.0
Access-Control-Expose-Headers: Upload-Offset, Location, Upload-Length, Tus-Version, Tus-Resumable, Tus-Max-Size, Tus-Extension, Upload-Metadata
Location: http://localhost:8000/files/2d70739670d3304cbb8d3f2203857fef
```
