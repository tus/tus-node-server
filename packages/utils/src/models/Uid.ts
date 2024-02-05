import crypto from 'node:crypto'

export const Uid = {
  rand() {
    return crypto.randomBytes(16).toString('hex')
  },
}
