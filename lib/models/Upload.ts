type TUpload = {
  id: string
  size?: number
  offset: number
  metadata?: string
}

export default class Upload {
  id: TUpload['id']
  metadata?: TUpload['metadata']
  size?: TUpload['size']
  offset: TUpload['offset']

  constructor(upload: TUpload) {
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
