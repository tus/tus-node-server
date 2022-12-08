# Contributing

We are using [Corepack][] so you don’t have to worry about installing the right package manager and managing the version of [Yarn][].
Corepack comes pre-installed with Node.js >=16.x, or can be installed through `npm`.
You can run `corepack enable` to install a `yarn` executable in your `$PATH`, or prefix all yarn commands with `corepack yarn`.

```sh
corepack -v || npm i -g corepack
yarn -v || corepack enable
yarn install || corepack yarn install
```

`tus-node-server` is a mono-repository managed by [Turborepo](https://turbo.build/repo).
This means running `yarn build` in the root will build all packages in parallel.
The same goes for `lint` and `format`.

## Tests

You can run tests for individual packages by running a Yarn workspace command.
For instance, for the `@tus/server`:

```bash
yarn workspace @tus/server test
```

Running tests for `@tus/gcs-store` requires a `keyfile.json` with credentials to be present in root.

`@uppy/s3-store` also requires credentials, but these should be injected.
The easiest way to do this is creating a `.env.sh` (which is in `.gitignore`) with the following exports:

```bash
export AWS_BUCKET="***"
export AWS_ACCESS_KEY_ID="***"
export AWS_SECRET_ACCESS_KEY="***"
export AWS_REGION="***"
```

And run it:

```bash
source .env.sh && yarn workspace @tus/s3-store test
```

You can run all tests with (requires both S3 and GCS credentials):

```bash
yarn test
```

---

If setting up buckets is too much effort, create a pull request and check if GitHub Actions succeeds with your changes.
