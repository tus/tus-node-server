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
$ curl -X POST -I -H "Entity-Length: 12345678" -H "Content-Length: 0" http://127.0.0.1:8000/files

HTTP/1.1 201 Created
Location: http://127.0.0.1:8000/files/cb58578de5278d83dcdc7448864d33d7
```
