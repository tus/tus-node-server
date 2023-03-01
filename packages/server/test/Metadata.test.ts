import {strict as assert} from 'node:assert'
import {parse, stringify} from '../src/models/Metadata'

describe('Metadata', () => {
  it('parse valid metadata string', () => {
    const str =
      'file/name dGVzdC5tcDQ=,size OTYwMjQ0,type! dmlkZW8vbXA0,video,withWhitespace '
    const obj = {
      'file/name': 'test.mp4',
      size: '960244',
      'type!': 'video/mp4',
      video: null,
      withWhitespace: null,
    }
    const decoded = parse(str)
    assert.deepStrictEqual(decoded, obj)
  })

  it('check length of metadata string', () => {
    const obj = {
      filename: 'test.mp4',
      size: '960244',
      type: 'video/mp4',
      video: null,
      withWhitespace: null,
    }
    const encoded = stringify(obj)

    assert.strictEqual(encoded.split(',').length, Object.entries(obj).length)
  })

  it('verify metadata stringification', () => {
    assert.strictEqual(stringify({filename: 'test.mp4'}), 'filename dGVzdC5tcDQ=')
    assert.strictEqual(stringify({size: '960244'}), 'size OTYwMjQ0')
    assert.strictEqual(stringify({type: 'video/mp4'}), 'type dmlkZW8vbXA0')
    // Multiple valid options
    assert.notStrictEqual(['video', 'video '].indexOf(stringify({video: null})), -1)
    assert.notStrictEqual(
      ['withWhitespace', 'withWhitespace '].indexOf(stringify({withWhitespace: null})),
      -1
    )
  })

  it('verify metadata parsing', () => {
    assert.deepStrictEqual(parse('filename dGVzdC5tcDQ='), {
      filename: 'test.mp4',
    })
    assert.deepStrictEqual(parse('size OTYwMjQ0'), {size: '960244'})
    assert.deepStrictEqual(parse('type dmlkZW8vbXA0'), {
      type: 'video/mp4',
    })
    assert.deepStrictEqual(parse('video'), {video: null})
    assert.deepStrictEqual(parse('video '), {video: null})
    assert.deepStrictEqual(parse('withWhitespace'), {
      withWhitespace: null,
    })
    assert.deepStrictEqual(parse('withWhitespace '), {
      withWhitespace: null,
    })
  })

  it('cyclic test', () => {
    const obj = {
      filename: 'world_domination_plan.pdf',
      is_confidential: null,
    }
    // Object -> string -> object
    assert.deepStrictEqual(parse(stringify(obj)), obj)
  })

  describe('verify invalid metadata string', () => {
    it('duplicate keys', () => {
      assert.throws(() => {
        parse('filename dGVzdC5tcDQ=, filename cGFja2FnZS5qc29u')
      })
      assert.throws(() => {
        parse('video ,video dHJ1ZQ==')
      })
      assert.throws(() => {
        parse('size,size ')
      })
      assert.throws(() => {
        parse('')
      })
      assert.throws(() => {
        parse('\t\n')
      })
    })

    it('invalid key', () => {
      assert.throws(() => {
        parse('🦁 ZW1vamk=')
      })
      assert.throws(() => {
        parse('€¢ß')
      })
      assert.throws(() => {
        parse('test, te st ')
      })
      assert.throws(() => {
        parse('test,,test')
      })
    })

    it('invalid base64 value', () => {
      assert.throws(() => {
        parse('key ZW1vamk')
      }) // Value is not a multiple of 4 characters
      assert.throws(() => {
        parse('key invalid-base64==')
      })
      assert.throws(() => {
        parse('key =ZW1vamk')
      }) // Padding can not be at the beginning
      assert.throws(() => {
        parse('key  ')
      }) // Only single whitespace is allowed
    })
  })
})
