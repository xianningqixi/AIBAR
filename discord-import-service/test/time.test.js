import assert from 'node:assert/strict';
import test from 'node:test';

import { dateKeyInShanghai, manualTodayWindow } from '../src/time.js';

test('manual jobs use the current Asia/Shanghai day up to the trigger instant', () => {
    const now = new Date('2026-08-06T02:30:00.000Z');
    assert.equal(dateKeyInShanghai(now), '2026-08-06');
    assert.deepEqual(manualTodayWindow(now), {
        localDate: '2026-08-06',
        start: '2026-08-05T16:00:00.000Z',
        end: '2026-08-06T02:30:00.000Z',
    });
});

test('manual day boundaries follow Shanghai rather than the host timezone', () => {
    assert.deepEqual(manualTodayWindow(new Date('2026-08-05T16:00:00.000Z')), {
        localDate: '2026-08-06',
        start: '2026-08-05T16:00:00.000Z',
        end: '2026-08-05T16:00:00.000Z',
    });
    assert.throws(() => manualTodayWindow(new Date('invalid')), /valid date/);
});
