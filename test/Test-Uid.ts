// @ts-expect-error TS(2307): Cannot find module 'assert' or its corresponding t... Remove this comment to see the full error message
import assert from 'assert';
import Uid from '../lib/models/Uid.js';
// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Uid', () => {
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('returns a 32 char string', (done: any) => {
        const id = Uid.rand();
        assert.equal(typeof id, 'string');
        assert.equal(id.length, 32);
        done();
    });
    // @ts-expect-error TS(2582): Cannot find name 'it'. Do you need to install type... Remove this comment to see the full error message
    it('returns a different string every time', (done: any) => {
        const ids = {};
        for (let i = 0; i < 16; i++) {
            const id = Uid.rand();
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            assert(!ids[id], 'id was encountered multiple times');
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            ids[id] = true;
        }
        done();
    });
});
