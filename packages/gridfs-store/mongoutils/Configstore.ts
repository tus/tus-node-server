import {Upload} from '@tus/server'

import {Db, Collection, WithId} from 'mongodb'

interface Configstore {
  get(key: string): Promise<Upload | undefined>
  set(key: string, value: Upload): Promise<void>
  delete(key: string): Promise<void>

  list?(): Promise<Array<string>>
}
interface ConfigData {
  id: string
  size?: number
  offset: number
  metadata?: string
  creation_date?: string
  current_size: number
  paused: boolean
}
/**
 * Mongodb based configstore
 * @author Spencer Najib <spencernajib2@gmail.com>
 *
 */

export class MongodbConfigStore implements Configstore {
  collection: Collection<ConfigData>
  constructor(private mongo: Db, private collectionName: string = 'upload_config_store') {
    this.mongo = mongo
    this.collectionName = collectionName
    this.collection = mongo.collection<ConfigData>(this.collectionName)
    this.collection.createIndex({id: 1})
    this.collection.createIndex({creation_date: 1})
  }

  async set(key: string, value: Upload): Promise<void> {
    await this.collection.findOneAndUpdate(
      {id: key},
      {
        $set: {
          ...value,
          current_size: 0,
          paused: false,
          metadata: value.metadata ? JSON.stringify(value.metadata) : undefined,
        },
      },
      {upsert: true}
    )
  }
  async exists(key: string) {
    const file = await this.collection.findOne({id: key})
    return file ? true : false
  }
  async setCurrentSize(key: string, value: number): Promise<void> {
    await this.collection.findOneAndUpdate({id: key}, {$set: {current_size: value}})
  }
  async setPaused(key: string, value: boolean): Promise<void> {
    await this.collection.findOneAndUpdate({id: key}, {$set: {paused: value}})
  }

  async getStats(key: string) {
    const result = await this.collection.findOne({id: key})

    if (!result) {
      return
    }
    return this.serializeMetadata(result)
  }
  serializeMetadata(result: WithId<ConfigData>) {
    const metadata = result.metadata
      ? (JSON.parse(result.metadata) as Record<string, string | null>)
      : undefined
    return {...result, metadata}
  }

  async delete(key: string): Promise<void> {
    await this.collection.findOneAndDelete({id: key})
  }
  async get(key: string): Promise<Upload | undefined> {
    const result = await this.collection.findOne({id: key})

    if (!result) {
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {_id, ...rest} = this.serializeMetadata(result)

    const upload = new Upload({...rest})

    return upload
  }

  async list(): Promise<Array<string>> {
    const result = await this.collection.find({}, {projection: {_id: false}}).toArray()

    return result.map((doc) => doc.id)
  }
  async clear() {
    return this.collection.deleteMany({})
  }
}
