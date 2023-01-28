import {HEADERS_LOWERCASE, TUS_VERSION, TUS_RESUMABLE} from '../constants'

export const RequestValidator = {
  // All PATCH requests MUST include a Upload-Offset header
  _invalidUploadOffsetHeader(value: string | undefined) {
    // @ts-expect-error isNan can in fact expect non-number args
    return isNaN(value) || Number.parseInt(value as string, 10) < 0
  },

  // The value MUST be a non-negative integer.
  _invalidUploadLengthHeader(value: string | undefined) {
    // @ts-expect-error isNan can in fact expect non-number args
    return isNaN(value) || Number.parseInt(value as string, 10) < 0
  },

  // The Upload-Defer-Length value MUST be 1.
  _invalidUploadDeferLengthHeader(value: string | undefined) {
    // @ts-expect-error isNan can in fact expect non-number args
    return isNaN(value) || Number.parseInt(value as string, 10) !== 1
  },

  // The Upload-Metadata request and response header MUST consist of one
  // or more comma-separated key-value pairs. The key and value MUST be
  // separated by a space. The key MUST NOT contain spaces and commas and
  // MUST NOT be empty. The key SHOULD be ASCII encoded and the value MUST
  // be Base64 encoded. All keys MUST be unique.
  _invalidUploadMetadataHeader(value: string) {
    const keypairs = value.split(',').map((keypair) => keypair.trim().split(' '))
    return keypairs.some(
      (keypair) => keypair[0] === '' || (keypair.length !== 2 && keypair.length !== 1)
    )
  },

  _invalidXRequestedWithHeader() {
    return false
  },

  _invalidXForwardedHostHeader() {
    return false
  },

  _invalidXForwardedProtoHeader(value: string) {
    return !['http', 'https'].includes(value)
  },

  _invalidTusVersionHeader(value: string) {
    // @ts-expect-error we can compare a literal
    return !TUS_VERSION.includes(value)
  },

  _invalidTusResumableHeader(value: string) {
    return value !== TUS_RESUMABLE
  },

  _invalidTusExtensionHeader() {
    return false
  },

  _invalidTusMaxSizeHeader() {
    return false
  },

  _invalidXHttpMethodOverrideHeader() {
    return false
  },

  // All PATCH requests MUST use Content-Type: application/offset+octet-stream.
  _invalidContentTypeHeader(value: string | undefined) {
    return value !== 'application/offset+octet-stream'
  },

  _invalidAuthorizationHeader() {
    return false
  },

  _invalidUploadConcatHeader(value: string) {
    const valid_partial = value === 'partial'
    const valid_final = value.startsWith('final;')
    return !valid_partial && !valid_final
  },

  capitalizeHeader(header_name: string) {
    return header_name
      .replace(/\b[a-z]/g, function (substring) {
        return substring.toUpperCase()
      })
      .replace(/-/g, '')
  },

  isInvalidHeader(header_name: string, header_value: string | undefined): boolean {
    // @ts-expect-error we can compare string literals
    if (!HEADERS_LOWERCASE.includes(header_name)) {
      return false
    }

    const method = `_invalid${this.capitalizeHeader(header_name)}Header`
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return this[method](header_value)
  },
}
