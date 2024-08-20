import type httpMocks from 'node-mocks-http'
import stream from 'node:stream'
import type http from 'node:http'

export function addPipableStreamBody<
  T extends httpMocks.MockRequest<http.IncomingMessage>,
>(mockRequest: T) {
  // Create a Readable stream that simulates the request body
  const bodyStream = new stream.Duplex({
    read() {
      this.push(
        mockRequest.body instanceof Buffer
          ? mockRequest.body
          : JSON.stringify(mockRequest.body)
      )
      this.push(null)
    },
  })

  // Add the pipe method to the mockRequest
  // @ts-ignore
  mockRequest.pipe = (dest: stream.Writable) => bodyStream.pipe(dest)

  // Add the unpipe method to the mockRequest
  // @ts-ignore
  mockRequest.unpipe = (dest: stream.Writable) => bodyStream.unpipe(dest)
  return mockRequest
}
