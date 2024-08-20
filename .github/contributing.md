# Contributing

## Changesets

We use [changesets](https://github.com/changesets/changesets) to manage versioning,
changelogs and publishing. This means when you contribute a PR you have to run
`npx changeset add` to indicate the semver bump you are making and to add a changelog
entry.

## Tests

You can run tests for individual packages by running a NPM workspace command. For
instance, for the `@tus/server`:

```bash
npm run --workspace @tus/server test
```

Running tests for `@tus/gcs-store` requires a `keyfile.json` with credentials to be
present in root.

`@uppy/s3-store` also requires credentials, but these should be injected. The easiest way
to do this is creating a `.env.sh` (which is in `.gitignore`) with the following exports:

```bash
export AWS_BUCKET="***"
export AWS_ACCESS_KEY_ID="***"
export AWS_SECRET_ACCESS_KEY="***"
export AWS_REGION="***"
```

And run it:

```bash
source .env.sh && npm run --workspace @tus/s3-store test
```

You can run all tests with (requires both S3 and GCS credentials):

```bash
npm test
```

---

If setting up buckets is too much effort, create a pull request and check if GitHub
Actions succeeds with your changes.
