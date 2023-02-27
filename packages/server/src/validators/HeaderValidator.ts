import {TUS_VERSION, TUS_RESUMABLE} from '../constants'

type validator = (value?: string) => boolean

export const validators = new Map<string, validator>([
  [
    'upload-offset',
    function (value: string | undefined) {
      // @ts-expect-error isNan can in fact expect non-number args
      return isNaN(value) || Number.parseInt(value as string, 10) < 0
    },
  ],
  [
    'upload-length',
    // The value MUST be a non-negative integer.
    function (value: string | undefined) {
      // @ts-expect-error isNan can in fact expect non-number args
      return isNaN(value) || Number.parseInt(value as string, 10) < 0
    },
  ],
  [
    'upload-defer-length',
    // The Upload-Defer-Length value MUST be 1.
    function (value: string | undefined) {
      // @ts-expect-error isNan can in fact expect non-number args
      return isNaN(value) || Number.parseInt(value as string, 10) !== 1
    },
  ],
  [
    'upload-metadata',
    // The Upload-Metadata request and response header MUST consist of one
    // or more comma-separated key-value pairs. The key and value MUST be
    // separated by a space. The key MUST NOT contain spaces and commas and
    // MUST NOT be empty. The key SHOULD be ASCII encoded and the value MUST
    // be Base64 encoded. All keys MUST be unique.
    function (value: string | undefined) {
      if (!value) return true
      const keypairs = value.split(',').map((keypair) => keypair.trim().split(' '))
      return keypairs.some(
        (keypair) => keypair[0] === '' || (keypair.length !== 2 && keypair.length !== 1)
      )
    },
  ],
  [
    'x-forwarded-proto',
    function (value: string | undefined) {
      // @ts-expect-error possible
      return !['http', 'https'].includes(value)
    },
  ],
  [
    'tus-version',
    function (value: string | undefined) {
      // @ts-expect-error we can compare a literal
      return !TUS_VERSION.includes(value)
    },
  ],
  [
    'tus-resumable',
    function (value: string | undefined) {
      return value !== TUS_RESUMABLE
    },
  ],
  [
    'content-type',
    function (value: string | undefined) {
      return value !== 'application/offset+octet-stream'
    },
  ],
  [
    'upload-concat',
    function (value = '') {
      const valid_partial = value === 'partial'
      const valid_final = value.startsWith('final;')
      return !valid_partial && !valid_final
    },
  ],
])

export function invalidHeader(name: string, value?: string): boolean {
  const lowercaseName = name.toLowerCase()
  if (!validators.has(lowercaseName)) {
    return false
  }
  // @ts-expect-error if already guards
  return validators.get(lowercaseName)(value)
}
