import type httpMocks from 'node-mocks-http'
import stream, {Readable, Transform, TransformCallback} from 'node:stream'
import type http from 'node:http'

export function addPipableStreamBody<
  T extends httpMocks.MockRequest<http.IncomingMessage>,
>(mockRequest: T) {
  // Create a Readable stream that simulates the request body
  const bodyStream = new stream.Duplex({
    read() {
      // This function is intentionally left empty since the data flow
      // is controlled by event listeners registered outside of this method.
    },
  })

  // Handle cases where the body is a Readable stream
  if (mockRequest.body instanceof Readable) {
    // Pipe the mockRequest.body to the bodyStream
    mockRequest.body.on('data', (chunk) => {
      bodyStream.push(chunk) // Push the chunk to the bodyStream
    })

    mockRequest.body.on('end', () => {
      bodyStream.push(null) // Signal the end of the stream
    })
  } else {
    // Handle cases where the body is not a stream (e.g., Buffer or plain object)
    const bodyBuffer =
      mockRequest.body instanceof Buffer
        ? mockRequest.body
        : Buffer.from(JSON.stringify(mockRequest.body))

    // Push the bodyBuffer and signal the end of the stream
    bodyStream.push(bodyBuffer)
    bodyStream.push(null)
  }

  // Add the pipe method to the mockRequest
  // @ts-ignore
  mockRequest.pipe = (dest: stream.Writable) => bodyStream.pipe(dest)

  // Add the unpipe method to the mockRequest
  // @ts-ignore
  mockRequest.unpipe = (dest: stream.Writable) => bodyStream.unpipe(dest)

  return mockRequest
}
