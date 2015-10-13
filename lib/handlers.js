'use strict';

let handers = {
    head(req, res) {
        console.info(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write(`${req.method} Allowed`);
        res.end();
    },

    patch(req, res) {
        console.info(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write(`${req.method} Allowed`);
        res.end();
    },

    post(req, res) {
        console.info(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write(`${req.method} Allowed`);
        res.end();
    },

    options(req, res) {
        console.info(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write(`${req.method} Allowed`);
        res.end();
    },

    get(req, res) {
        console.info(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write(`${req.method} Allowed`);
        res.end();
    },
};

exports = module.exports = handers;
