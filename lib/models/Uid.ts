// @ts-expect-error TS(2307): Cannot find module 'crypto' or its corresponding t... Remove this comment to see the full error message
import crypto from 'crypto';
class Uid {
    static rand() {
        return crypto.randomBytes(16).toString('hex');
    }
}
export default Uid;
