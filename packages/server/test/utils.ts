import httpMocks from 'node-mocks-http'
import stream from 'node:stream'

export function addPipableStreamBody<T extends httpMocks.MockRequest<unknown>>(
  mockRequest: T
) {
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
  mockRequest.pipe = function (dest: stream.Writable) {
    return bodyStream.pipe(dest)
  }

  // Add the unpipe method to the mockRequest
  // @ts-ignore
  mockRequest.unpipe = function (dest: stream.Writable) {
    return bodyStream.unpipe(dest)
  }
  return mockRequest
}
