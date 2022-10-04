import crypto from 'node:crypto'

const Uid = {
  rand() {
    return crypto.randomBytes(16).toString('hex')
  },
}

export default Uid
