import CONSTANTS from '../constants'
class RequestValidator {
  // All PATCH requests MUST include a Upload-Offset header
  static _invalidUploadOffsetHeader(value: any) {
    return isNaN(value) || parseInt(value, 10) < 0
  }
  // The value MUST be a non-negative integer.
  static _invalidUploadLengthHeader(value: any) {
    return isNaN(value) || parseInt(value, 10) < 0
  }
  // The Upload-Defer-Length value MUST be 1.
  static _invalidUploadDeferLengthHeader(value: any) {
    return isNaN(value) || parseInt(value, 10) !== 1
  }
  // The Upload-Metadata request and response header MUST consist of one
  // or more comma-separated key-value pairs. The key and value MUST be
  // separated by a space. The key MUST NOT contain spaces and commas and
  // MUST NOT be empty. The key SHOULD be ASCII encoded and the value MUST
  // be Base64 encoded. All keys MUST be unique.
  static _invalidUploadMetadataHeader(value: any) {
    const keypairs = value.split(',').map((keypair: any) => keypair.trim().split(' '))
    return keypairs.some(
      (keypair: any) =>
        keypair[0] === '' || (keypair.length !== 2 && keypair.length !== 1)
    )
  }
  static _invalidXRequestedWithHeader() {
    return false
  }
  static _invalidTusVersionHeader(value: any) {
    return CONSTANTS.TUS_VERSION.indexOf(value) === -1
  }
  static _invalidTusResumableHeader(value: any) {
    return value !== CONSTANTS.TUS_RESUMABLE
  }
  static _invalidTusExtensionHeader(value: any) {
    return false
  }
  static _invalidTusMaxSizeHeader() {
    return false
  }
  static _invalidXHttpMethodOverrideHeader() {
    return false
  }
  // All PATCH requests MUST use Content-Type: application/offset+octet-stream.
  static _invalidContentTypeHeader(value: any) {
    return value !== 'application/offset+octet-stream'
  }
  static _invalidAuthorizationHeader() {
    return false
  }
  static _invalidUploadConcatHeader(value: any) {
    const valid_partial = value === 'partial'
    const valid_final = value.startsWith('final;')
    return !valid_partial && !valid_final
  }
  static capitalizeHeader(header_name: any) {
    return header_name
      .replace(/\b[a-z]/g, function () {
        return arguments[0].toUpperCase()
      })
      .replace(/-/g, '')
  }
  static isInvalidHeader(header_name: any, header_value: any) {
    if (CONSTANTS.HEADERS_LOWERCASE.indexOf(header_name) === -1) {
      return false
    }
    const method = `_invalid${this.capitalizeHeader(header_name)}Header`
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
    return this[method](header_value)
  }
}
export default RequestValidator
