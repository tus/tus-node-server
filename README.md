# tus-node-server
[TUS Protocol 1.0.0](http://tus.io/protocols/resumable-upload.html) Server Implementation.

## Installation

```bash
$ npm install tus-node-server
```

## Quick Start

```javascript
let Tus = require('../lib/tus');
let server = new Tus();

const host = '127.0.0.1';
const port = 8000;
let server_options = { host, port };

server.route('/', ['GET'], (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write(`Hello tus!`);
    res.end();
});

server.listen(server_options, () => {
    console.log(`tus server listening at http://${host}:${port}`);
});
```

## Run Example
```bash
$ node example/server.js
```
