import type {Bucket, File, SaveOptions} from '@google-cloud/storage'
import debug from 'debug'

type MetaGeneration = string | number | undefined
export type FileMetadata = NonNullable<SaveOptions['metadata']>

const log = debug('tus-node-server:lockers:gcs')

/**
 * Handles communication with GCS.
 */
export default class GCSLockFile {
  /**
   * Name of the file in the bucket.
   */
  protected name: string
  /**
   * GCS File instance for the lock.
   */
  protected lockFile: File
  /**
   * GCS File instance for release request.
   */
  protected releaseFile: File
  /**
   * The last known metageneration of the file. If it does not match the GCS metageneration, this lockfile has been deleted and another instance has already created a new one.
   */
  protected currentMetaGeneration: MetaGeneration

  constructor(bucket: Bucket, name: string) {
    this.name = name
    this.lockFile = bucket.file(name)
    this.releaseFile = bucket.file(`${name}.release`)
  }
  /**
   * Create the lockfile with the specified exp time. Throws if the file already exists
   */
  public async create(exp: number) {
    const metadata = {
      metadata: {exp},
      // TODO: this does nothing?
      cacheControl: 'no-store',
    }

    await this.lockFile.save('', {
      preconditionOpts: {ifGenerationMatch: 0},
      metadata,
    })

    this.currentMetaGeneration = (await this.getMeta()).metageneration
  }

  /**
   * Fetch metadata of the lock file.
   */
  public async getMeta() {
    return (await this.lockFile.getMetadata())[0]
  }

  /**
   * Refresh our own lockfile. Throws if it does not exist or the file is modified by another instance.
   */
  public async refreshOwn(exp: number) {
    const metadata: FileMetadata = {
      exp,
    }
    const res = await this.lockFile.setMetadata(metadata, {
      ifMetaGenerationMatch: this.currentMetaGeneration,
    })
    this.currentMetaGeneration = res[0].metageneration
    log('updated currentMetaGeneration', this.currentMetaGeneration)
  }
  /**
   * Check if a release request has been submitted to our own lockfile. Throws if it does not exist or the file is modified by another instance.
   */
  public async checkOwnReleaseRequest() {
    const meta = await this.getMeta()
    if (meta.metageneration !== this.currentMetaGeneration) {
      throw new Error('This lockfile has been already taken by another instance.')
    }

    const releaseRequestExists = (await this.releaseFile.exists())[0]
    return releaseRequestExists
  }

  /**
   * Delete our own lockfile if it still exists.
   */
  public async deleteOwn() {
    try {
      await this.deleteReleaseRequest()
      await this.lockFile.delete({ifGenerationMatch: this.currentMetaGeneration})
    } catch (err) {
      //Probably already deleted, no need to report
    }
  }

  /**
   * Request releasing the lock from another instance.
   * As metadata edits are only prohibited for the owner
   * (so it can keep track of metageneration),
   * we write to a separate file.
   */
  public async requestRelease() {
    try {
      await this.releaseFile.save('', {
        preconditionOpts: {ifGenerationMatch: 0},
      })
      log('requestRelease success')
    } catch (err) {
      if (err.code === 412) {
        //Release file already created, no need to report
        return
      }
      log('requestRelease error', err)
      throw err
    }
  }

  /**
   * Delete the unhealthy file of a previous lock.
   */
  public async deleteUnhealthy(metaGeneration: number) {
    await this.deleteReleaseRequest()
    await this.lockFile.delete({ifMetagenerationMatch: metaGeneration})
    log('deleted NOT healthy lock')
  }

  /**
   * Delete release request file of the lock if exists.
   */
  protected async deleteReleaseRequest() {
    try {
      await this.releaseFile.delete()
    } catch (err) {}
  }
}
