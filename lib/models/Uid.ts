import crypto from 'node:crypto'

class Uid {
  static rand() {
    return crypto.randomBytes(16).toString('hex')
  }
}

export default Uid
