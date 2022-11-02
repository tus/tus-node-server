type Upload = {
  id: string
  size?: number
  offset: number
  metadata?: string
}

export default class File {
  id: Upload['id']
  metadata?: Upload['metadata']
  size?: Upload['size']
  offset: Upload['offset']

  constructor(upload: Upload) {
    if (!upload.id) {
      throw new Error('[File] constructor must be given an ID')
    }

    this.id = upload.id
    this.size = upload.size
    this.offset = upload.offset
    this.metadata = upload.metadata
  }

  get sizeIsDeferred(): boolean {
    return this.size === undefined
  }
}
