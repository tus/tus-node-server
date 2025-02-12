import type http from 'node:http'
import {createReadStream} from 'node:fs'
import {Readable} from 'node:stream'
import * as set_cookie_parser from 'set-cookie-parser'

function getRawBody(req: http.IncomingMessage) {
  const h = req.headers

  if (!h['content-type']) {
    return null
  }

  const content_length = Number(h['content-length'])

  // check if no request body
  if (
    (req.httpVersionMajor === 1 &&
      Number.isNaN(content_length) &&
      h['transfer-encoding'] == null) ||
    content_length === 0
  ) {
    return null
  }

  if (req.destroyed) {
    const readable = new ReadableStream()
    readable.cancel()
    return readable
  }

  let cancelled = false

  return new ReadableStream({
    start(controller) {
      req.on('error', (error) => {
        cancelled = true
        controller.error(error)
      })

      req.on('end', () => {
        if (cancelled) return
        controller.close()
      })

      req.on('data', (chunk) => {
        if (cancelled) return

        controller.enqueue(chunk)

        if (controller.desiredSize === null || controller.desiredSize <= 0) {
          req.pause()
        }
      })
    },

    pull() {
      req.resume()
    },

    cancel(reason) {
      cancelled = true
      req.destroy(reason)
    },
  })
}

export async function getRequest({
  request,
  base,
}: {request: http.IncomingMessage; base: string}) {
  let headers = request.headers
  if (request.httpVersionMajor >= 2) {
    // the Request constructor rejects headers with ':' in the name
    headers = Object.assign({}, headers)
    // https://www.rfc-editor.org/rfc/rfc9113.html#section-8.3.1-2.3.5
    if (headers[':authority']) {
      headers.host = headers[':authority'] as string
    }
    delete headers[':authority']
    delete headers[':method']
    delete headers[':path']
    delete headers[':scheme']
  }

  return new Request(base + request.url, {
    duplex: 'half',
    method: request.method,
    // @ts-expect-error it's fine
    headers: Object.entries(headers),
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : getRawBody(request),
  })
}

export async function setResponse(res: http.ServerResponse, response: Response) {
  for (const [key, value] of response.headers) {
    try {
      res.setHeader(
        key,
        key === 'set-cookie'
          ? set_cookie_parser.splitCookiesString(response.headers.get(key) as string)
          : value
      )
    } catch (error) {
      for (const name of res.getHeaderNames()) {
        res.removeHeader(name)
      }
      res.writeHead(500).end(String(error))
      return
    }
  }

  res.writeHead(response.status)

  if (!response.body) {
    res.end()
    return
  }

  if (response.body.locked) {
    res.end(
      'Fatal error: Response body is locked. ' +
        "This can happen when the response was already read (for example through 'response.json()' or 'response.text()')."
    )
    return
  }

  const reader = response.body.getReader()

  if (res.destroyed) {
    reader.cancel()
    return
  }

  const cancel = (error: Error | undefined) => {
    res.off('close', cancel)
    res.off('error', cancel)

    // If the reader has already been interrupted with an error earlier,
    // then it will appear here, it is useless, but it needs to be catch.
    reader.cancel(error).catch(() => {})
    if (error) res.destroy(error)
  }

  res.on('close', cancel)
  res.on('error', cancel)

  next()
  async function next() {
    try {
      for (;;) {
        const {done, value} = await reader.read()

        if (done) break

        if (!res.write(value)) {
          res.once('drain', next)
          return
        }
      }
      res.end()
    } catch (error) {
      cancel(error instanceof Error ? error : new Error(String(error)))
    }
  }
}

export function createReadableStream(file: string) {
  return Readable.toWeb(createReadStream(file))
}
