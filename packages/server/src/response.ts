const NULL_BODY_STATUSES = new Set([204, 205, 304])

export type ResponseHeaders = Headers | Record<string, string | number>

export const createResponse = (
  status: number,
  headers: ResponseHeaders,
  body?: string
) => {
  const responseHeaders = new Headers(
    headers instanceof Headers
      ? headers
      : Object.entries(headers).map(
          ([name, value]): [string, string] => [name, String(value)]
        )
  )

  if (NULL_BODY_STATUSES.has(status)) {
    responseHeaders.delete('Content-Length')
    return new Response(null, {status, headers: responseHeaders})
  }

  if (body !== undefined) {
    responseHeaders.set('Content-Length', String(Buffer.byteLength(body, 'utf8')))
  }

  return new Response(body, {status, headers: responseHeaders})
}
