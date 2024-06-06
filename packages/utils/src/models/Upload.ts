type TUpload = {
  id: string
  size?: number
  offset: number
  metadata?: Record<string, string | null>
  storage?: {
    type: string
    path: string
    bucket?: string
  }
  creation_date?: string
}

export class Upload {
  id: TUpload['id']
  metadata: TUpload['metadata']
  size: TUpload['size']
  offset: TUpload['offset']
  creation_date: TUpload['creation_date']
  storage: TUpload['storage']

  constructor(upload: TUpload) {
    if (!upload.id) {
      throw new Error('[File] constructor must be given an ID')
    }

    this.id = upload.id
    this.size = upload.size
    this.offset = upload.offset
    this.metadata = upload.metadata
    this.storage = upload.storage

    this.creation_date = upload.creation_date ?? new Date().toISOString()
  }

  get sizeIsDeferred(): boolean {
    return this.size === undefined
  }
}
