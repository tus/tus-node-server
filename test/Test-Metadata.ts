import assert from 'node:assert/strict';
import Metadata from '../lib/models/Metadata';
describe('Metadata', () => {
    it('parse valid metadata string', () => {
        const str = 'file/name dGVzdC5tcDQ=,size OTYwMjQ0,type! dmlkZW8vbXA0,video,withWhitespace ';
        const obj = {
            'file/name': 'test.mp4',
            'size': '960244',
            'type!': 'video/mp4',
            'video': undefined,
            'withWhitespace': undefined,
        };
        const decoded = Metadata.parse(str);
        assert.deepStrictEqual(decoded, obj);
    });

    it('check length of metadata string', () => {
        const obj = {
            filename: 'test.mp4',
            size: '960244',
            type: 'video/mp4',
            video: undefined,
            withWhitespace: undefined,
        };
        const encoded = Metadata.stringify(obj);

        assert.strictEqual(encoded.split(',').length, Object.entries(obj).length);
    });

    it('verify metadata stringification', () => {
        assert.strictEqual(Metadata.stringify({ filename: 'test.mp4' }), 'filename dGVzdC5tcDQ=');
        assert.strictEqual(Metadata.stringify({ size: '960244' }), 'size OTYwMjQ0');
        assert.strictEqual(Metadata.stringify({ type: 'video/mp4' }), 'type dmlkZW8vbXA0');
        // multiple valid options
        assert.notStrictEqual(['video', 'video '].indexOf(Metadata.stringify({ video: undefined })), -1);
        assert.notStrictEqual(['withWhitespace', 'withWhitespace '].indexOf(Metadata.stringify({ withWhitespace: undefined })), -1);
    });

    it('verify metadata parsing', () => {
        assert.deepStrictEqual(Metadata.parse('filename dGVzdC5tcDQ='), { filename: 'test.mp4' });
        assert.deepStrictEqual(Metadata.parse('size OTYwMjQ0'), { size: '960244' });
        assert.deepStrictEqual(Metadata.parse('type dmlkZW8vbXA0'), { type: 'video/mp4' });
        assert.deepStrictEqual(Metadata.parse('video'), { video: undefined });
        assert.deepStrictEqual(Metadata.parse('video '), { video: undefined });
        assert.deepStrictEqual(Metadata.parse('withWhitespace'), { withWhitespace: undefined });
        assert.deepStrictEqual(Metadata.parse('withWhitespace '), { withWhitespace: undefined });
    });

    it('cyclic test', () => {
        const obj = {
            filename: 'world_domination_plan.pdf',
            is_confidential: undefined,
        };
        // object -> string -> object
        assert.deepStrictEqual(Metadata.parse(Metadata.stringify(obj)), obj);
    });

    describe('verify invalid metadata string', () => {
        it('duplicate keys', () => {
            assert.throws(() => {
                Metadata.parse('filename dGVzdC5tcDQ=, filename cGFja2FnZS5qc29u');
            });
            assert.throws(() => {
                Metadata.parse('video ,video dHJ1ZQ==');
            });
            assert.throws(() => {
                Metadata.parse('size,size ');
            });
        });

        it('invalid key', () => {
            assert.throws(() => {
                Metadata.parse('🦁 ZW1vamk=');
            });
            assert.throws(() => {
                Metadata.parse('€¢ß');
            });
            assert.throws(() => {
                Metadata.parse('test, te st ');
            });
            assert.throws(() => {
                Metadata.parse('test,,test');
            });
        });

        it('invalid base64 value', () => {
            assert.throws(() => {
                Metadata.parse('key ZW1vamk');
            }); // value is not a multiple of 4 characters
            assert.throws(() => {
                Metadata.parse('key invalid-base64==');
            });
            assert.throws(() => {
                Metadata.parse('key =ZW1vamk');
            }); // padding can not be at the beginning
            assert.throws(() => {
                Metadata.parse('key  ');
            }); // only single whitespace is allowed
        });
    });
});
