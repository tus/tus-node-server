import httpMocks from 'node-mocks-http'
import stream from 'node:stream'

export function addPipableStreamBody<T extends httpMocks.MockRequest<unknown>>(
  mockRequest: T
) {
  // Create a Readable stream that simulates the request body
  const bodyStream = new stream.Readable({
    read() {
      this.push(JSON.stringify(mockRequest.body))
      this.push(null)
    },
  })

  // Add the pipe method to the mockRequest
  // @ts-ignore
  mockRequest.pipe = function (dest: stream.Writable) {
    bodyStream.pipe(dest)
  }
  return mockRequest
}
