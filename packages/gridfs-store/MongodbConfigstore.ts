import {Upload} from '@tus/server'

import {Db, Collection} from 'mongodb'
import {Configstore} from '@tus/file-store/configstores/Types'

interface ConfigData {
  id: string
  size?: number
  offset: number
  metadata?: string
  creation_date?: string
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
    this.collection.createIndex({id: 1, creation_date: 1})
  }

  async set(key: string, value: Upload): Promise<void> {
    await this.collection.findOneAndUpdate(
      {id: key},
      {
        $set: {
          ...value,
          metadata: value.metadata ? JSON.stringify(value.metadata) : undefined,
        },
      },
      {upsert: true}
    )
  }
  async delete(key: string): Promise<void> {
    await this.collection.findOneAndDelete({id: key})
  }
  async get(key: string): Promise<Upload | undefined> {
    const result = await this.collection.findOne({id: key})
    if (!result) return
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {_id, ...rest} = result
    const metadata = rest.metadata
      ? (JSON.parse(rest.metadata) as Record<string, string | null>)
      : undefined

    const upload = new Upload({...rest, metadata})
    return upload
  }

  async list(): Promise<Array<string>> {
    const result = await this.collection.find({}, {projection: {_id: false}}).toArray()

    return result.map((doc) => doc.id)
  }
}
