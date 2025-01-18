export type RequestRelease = () => Promise<void> | void

/**
 * The Locker interface creates a Lock instance for a given resource identifier.
 */
export interface Locker {
  newLock(id: string): Lock
}

/**
 * The Lock interface defines methods for implementing a locking mechanism.
 * It is primarily used to ensure exclusive access to resources, such as uploads and their metadata.
 *
 * The interface adheres to TUS protocol recommendations, emphasizing the need to prevent prolonged lock retention.
 * This approach helps manage resources efficiently and avoids issues with half-open TCP connections.
 *
 * Methods:
 * - lock(id, cancelReq): Acquires a lock on a resource identified by 'id'. If the lock is already held by another request,
 *   the 'cancelReq' callback is provided to signal the current lock holder to release the lock.
 *   The 'cancelReq' callback should be invoked when there's an attempt by another request to acquire a previously locked resource.
 *   This mechanism ensures that locks are held only as long as necessary and are promptly released for other requests.
 *
 * - unlock(id): Releases the lock held on the resource identified by 'id'. This should be called by the lock holder
 *   after completing their operation or upon receiving a signal through the 'cancelReq' callback from a subsequent request
 *   attempting to acquire the lock.
 *
 */
export interface Lock {
  lock(signal: AbortSignal, cancelReq: RequestRelease): Promise<void>
  unlock(): Promise<void>
}
