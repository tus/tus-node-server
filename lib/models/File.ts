/**
 * @fileOverview
 * Model for File objects.
 *
 * @author Ben Stahl <bhstahl@gmail.com>
 */
class File {
  id: any
  upload_defer_length: any
  upload_length: any
  upload_metadata: any
  constructor(
    file_id: any,
    upload_length: any,
    upload_defer_length: any,
    upload_metadata: any
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
export default File
