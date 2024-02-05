/**
 * The CancellationContext interface provides mechanisms to manage the termination of a request.
 * It is designed to handle two types of request terminations: immediate abortion and graceful cancellation.
 *
 * Properties:
 * - signal: An instance of AbortSignal. It allows external entities to listen for cancellation requests,
 *   making it possible to react accordingly.
 *
 * Methods:
 * - abort(): This function should be called to immediately terminate the request. It is intended for scenarios
 *   where the request cannot continue and needs to be stopped as soon as possible, such as due to upload errors
 *   or invalid conditions. Implementers should ensure that invoking this method leads to the swift cessation of all
 *   request-related operations to save resources.
 *
 * - cancel(): This function is used for more controlled termination of the request. It signals that the request should
 *   be concluded, but allows for a short period of time to finalize operations gracefully. This could involve
 *   completing current transactions or cleaning up resources. The exact behavior and the time allowed for cancellation
 *   completion are determined by the implementation, but the goal is to try to end the request without abrupt interruption,
 *   ensuring orderly shutdown of ongoing processes.
 */
export interface CancellationContext {
  signal: AbortSignal
  abort: () => void
  cancel: () => void
}
