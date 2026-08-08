import assert from 'node:assert/strict';
import test from 'node:test';

import { dateKeyInShanghai } from '../src/time.js';

test('job labels use the Asia/Shanghai calendar day', () => {
    assert.equal(dateKeyInShanghai(new Date('2026-08-06T02:30:00.000Z')), '2026-08-06');
    // UTC 16:00 已是上海次日零点
    assert.equal(dateKeyInShanghai(new Date('2026-08-05T16:00:00.000Z')), '2026-08-06');
    assert.throws(() => dateKeyInShanghai(new Date('invalid')), /valid date/);
});
