import type {CancellationContext} from '@tus/utils'

export const createContext = (): CancellationContext => {
  const abortController = new AbortController()

  return {
    cancel: () => abortController.abort(),
    abort: () => abortController.abort(),
    signal: abortController.signal,
  }
}
