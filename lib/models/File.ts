export default class File {
  id: string
  upload_defer_length?: string
  upload_metadata?: string
  upload_length?: string
  size?: number

  constructor(
    file_id: string,
    upload_length: string | undefined,
    upload_defer_length?: string,
    upload_metadata?: string
  ) {
    if (!file_id) {
      throw new Error('[File] constructor must be given a file_id')
    }

    if (upload_length === undefined && upload_defer_length === undefined) {
      throw new Error(
        '[File] constructor must be given either a upload_length or upload_defer_length'
      )
    }

    this.id = `${file_id}`
    this.upload_length = upload_length
    this.upload_defer_length = upload_defer_length
    this.upload_metadata = upload_metadata
  }
}
