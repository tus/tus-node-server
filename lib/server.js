'use strict';

let http = require('http');

const PORT = 8000;
const HOST = '127.0.0.1';
const TIMEOUT = 30000;

let handler = (req, res) => {
    console.info(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    const html = `<!DOCTYPE "html">
                <html>
                <head>
                    <title>Hello World</title>
                </head>
                <body>
                    <p>Hello World!</p>
                </body>
                </html>`
    res.writeHead(200, {"Content-Type": "text/html"});
    res.write(html);
    res.end();
};

let server = http.createServer(handler);
server.timeout = TIMEOUT;
let server_options = {
  host: HOST,
  port: PORT
}
server.listen(server_options, () => {
    console.info(`[${new Date().toLocaleTimeString()}] tus server listening at http://${server.address().address}:${PORT}`);
});
