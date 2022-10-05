import {HEADERS_LOWERCASE, TUS_VERSION, TUS_RESUMABLE} from '../constants'

const RequestValidator = {
  // All PATCH requests MUST include a Upload-Offset header
  _invalidUploadOffsetHeader(value: any) {
    return isNaN(value) || Number.parseInt(value, 10) < 0
  },

  // The value MUST be a non-negative integer.
  _invalidUploadLengthHeader(value: any) {
    return isNaN(value) || Number.parseInt(value, 10) < 0
  },

  // The Upload-Defer-Length value MUST be 1.
  _invalidUploadDeferLengthHeader(value: any) {
    return isNaN(value) || Number.parseInt(value, 10) !== 1
  },

  // The Upload-Metadata request and response header MUST consist of one
  // or more comma-separated key-value pairs. The key and value MUST be
  // separated by a space. The key MUST NOT contain spaces and commas and
  // MUST NOT be empty. The key SHOULD be ASCII encoded and the value MUST
  // be Base64 encoded. All keys MUST be unique.
  _invalidUploadMetadataHeader(value: any) {
    const keypairs = value.split(',').map((keypair: any) => keypair.trim().split(' '))
    return keypairs.some(
      (keypair: any) =>
        keypair[0] === '' || (keypair.length !== 2 && keypair.length !== 1)
    )
  },

  _invalidXRequestedWithHeader() {
    return false
  },

  _invalidTusVersionHeader(value: any) {
    return !TUS_VERSION.includes(value)
  },

  _invalidTusResumableHeader(value: any) {
    return value !== TUS_RESUMABLE
  },

  _invalidTusExtensionHeader(value: any) {
    return false
  },

  _invalidTusMaxSizeHeader() {
    return false
  },

  _invalidXHttpMethodOverrideHeader() {
    return false
  },

  // All PATCH requests MUST use Content-Type: application/offset+octet-stream.
  _invalidContentTypeHeader(value: any) {
    return value !== 'application/offset+octet-stream'
  },

  _invalidAuthorizationHeader() {
    return false
  },

  _invalidUploadConcatHeader(value: any) {
    const valid_partial = value === 'partial'
    const valid_final = value.startsWith('final;')
    return !valid_partial && !valid_final
  },

  capitalizeHeader(header_name: string) {
    return header_name
      .replace(/\b[a-z]/g, function () {
        // eslint-disable-next-line prefer-rest-params
        return arguments[0].toUpperCase()
      })
      .replace(/-/g, '')
  },

  isInvalidHeader(header_name: any, header_value: any): boolean {
    if (!HEADERS_LOWERCASE.includes(header_name)) {
      return false
    }

    const method = `_invalid${this.capitalizeHeader(header_name)}Header`
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return this[method](header_value)
  },
}
export default RequestValidator