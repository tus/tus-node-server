# tus-node-server

<img alt="Tus logo" src="https://github.com/tus/tus.io/blob/master/assets/img/tus1.png?raw=true" width="30%" align="right" />

> **tus** is a protocol based on HTTP for *resumable file uploads*. Resumable
> means that an upload can be interrupted at any moment and can be resumed without
> re-uploading the previous data again. An interruption may happen willingly, if
> the user wants to pause, or by accident in case of an network issue or server
> outage.

tus-node-server is an official implementation of the [tus resumable upload protocol](http://www.tus.io/protocols/resumable-upload.html).
The protocol specifies a flexible method to upload files to remote servers using HTTP.
The special feature is the ability to pause and resume uploads at any
moment allowing to continue seamlessly after e.g. network interruptions.

It is capable of accepting uploads with arbitrary sizes and storing them locally
on disk, on Google Cloud Storage or on AWS S3 (or any other S3-compatible
storage system). Due to its modularization and extensibility, support for
nearly any other cloud provider could easily be added to tusd.

## Contents

* [When should I use this?](#when-should-i-use-this)
* [Quick start](#quick-start)
* [Packages](#packages)
* [Demos](#demos)
* [Types](#types)
* [Compatibility](#compatibility)
* [Contribute](#contribute)
* [License](#license)

## When should I use this?

When you want reliable, resumable uploads.
Together with a client like [tus-js-client](https://github.com/tus/tus-js-client) or [Uppy](https://uppy.io),
you'll have a plug-and-play experience.

tus-node-server in particular makes sense if you want to host a Node.js server or integrate it into your existing one.
There are also other mature servers, like [tusd](https://github.com/tus/tusd), [tusdotnet](https://github.com/tusdotnet/tusdotnet),
[rustus](https://github.com/s3rius/rustus), and [many others](https://tus.io/implementations.html).

## Quick start

## Packages

## Demos

Start the demo server using Local File Storage

```bash
npm run demo
```

Or start up the demo server using Google Cloud Storage

```bash
npm run demo:gcs
```

Then navigate to the demo ([localhost:1080](http://localhost:1080)) which uses [`tus-js-client`](https://github.com/tus/tus-js-client)

## Types

## Compatibility

## Contribute

We are using [Corepack][] so you don’t have to worry about installing the right package manager and managing the version of [Yarn][].
Corepack comes pre-installed with Node.js >=16.x, or can be installed through `npm`.
You can run `corepack enable` to install a `yarn` executable in your `$PATH`, or prefix all yarn commands with `corepack yarn`.

```sh
corepack -v || npm i -g corepack
yarn -v || corepack enable
yarn install || corepack yarn install
```

[Corepack]: https://nodejs.org/api/corepack.html

[Yarn]: https://yarnpkg.com/

## License

[MIT](https://github.com/tus/tus-node-server/blob/master/license) © [tus](https://github.com/tus)
