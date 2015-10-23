# tus-node-server
[TUS Protocol 1.0.0](http://tus.io/protocols/resumable-upload.html) Server Implementation.

## Installation

```bash
$ npm install tus-node-server
```

## Quick Start

#### Build the server
```javascript
let Tus = require('../lib/tus');
let server = new Tus();

const host = '127.0.0.1';
const port = 8000;
let server_options = { host, port };

let hashingFunction = (file_size) => {
    return Math.round(Math.random() * file_size) * new Date().getTime();
};

server.fileRoute('/files', hashingFunction);

server.listen(server_options, () => {
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
Location: http://127.0.0.1:8000/files/e29049285f1b4bca89b12348cd5473a4
Connection: keep-alive
Transfer-Encoding: chunked
```
