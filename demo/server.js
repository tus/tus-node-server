'use strict'

const path = require('path')
const fs = require('fs')
const assert = require('assert')

const Server = require('../index').Server
const FileStore = require('../index').FileStore
const GCSDataStore = require('../index').GCSDataStore
const S3Store = require('../index').S3Store
const EVENTS = require('../index').EVENTS

const options = {path: '/files'}

const server = new Server(options)

const data_store = process.env.DATA_STORE || 'FileStore'

switch (data_store) {
  case 'GCSDataStore':
    server.datastore = new GCSDataStore({
      projectId: 'vimeo-open-source',
      keyFilename: path.resolve(__dirname, '../keyfile.json'),
      bucket: 'tus-node-server',
    })
    break

  case 'S3Store':
    assert.ok(
      process.env.AWS_ACCESS_KEY_ID,
      'environment variable `AWS_ACCESS_KEY_ID` must be set'
    )
    assert.ok(
      process.env.AWS_SECRET_ACCESS_KEY,
      'environment variable `AWS_SECRET_ACCESS_KEY` must be set'
    )
    assert.ok(process.env.AWS_BUCKET, 'environment variable `AWS_BUCKET` must be set')
    assert.ok(process.env.AWS_REGION, 'environment variable `AWS_REGION` must be set')

    server.datastore = new S3Store({
      bucket: process.env.AWS_BUCKET,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
      partSize: 8 * 1024 * 1024, // each uploaded part will have ~8MB,
    })
    break

  default:
    server.datastore = new FileStore({directory: './files'})
}

/**
 * Basic GET handler to serve the demo html/js
 *
 * @param  {object} req http.incomingMessage
 * @param  {object} res http.ServerResponse
 */
const writeFile = (req, res) => {
  // Determine file to serve
  let filename = req.url
  if (filename == '/') {
    filename = '/index.html'
  }
  if (!filename.startsWith('/dist/')) {
    filename = '/demos/browser' + filename
  }
  filename = path.join(process.cwd(), '/node_modules/tus-js-client', filename)
  fs.readFile(filename, 'binary', (err, file) => {
    if (err) {
      res.writeHead(500, {'Content-Type': 'text/plain'})
      res.write(err)
      res.end()
      return
    }

    // Update demo URL to point to our local server
    file = file.replace(
      'https://tusd.tusdemo.net/files/',
      `http://${host}:${port}/files/`
    )

    res.writeHead(200)
    res.write(file)
    res.end()
  })
}

// Define routes to serve the demo html/js files.
server.get('/', writeFile)
server.get('/index.html', writeFile)
server.get('/demo.js', writeFile)
server.get('/demo.css', writeFile)
server.get('/video.html', writeFile)
server.get('/video.js', writeFile)
server.get('/dist/tus.js', writeFile)
server.get('/dist/tus.js.map', writeFile)
server.get('/dist/tus.min.js', writeFile)
server.get('/dist/tus.min.js.map', writeFile)

server.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
  console.log(
    `[${new Date().toLocaleTimeString()}] [EVENT HOOK] Upload complete for file ${
      event.file.id
    }`
  )
})

// // this is the express stile ;)
// const express = require('express');
// const app = express();
// const uploadApp = express();
// uploadApp.all('*', server.handle.bind(server));
// app.use('/uploads', uploadApp);
// app.get('*', writeFile);

const host = '127.0.0.1'
const port = 1080
server.listen({host, port}, () => {
  console.log(
    `[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port} using ${data_store}`
  )
})
