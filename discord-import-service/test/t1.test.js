import assert from 'node:assert/strict';
import test from 'node:test';

import {
    dateKeyInShanghai,
    nextRunAt,
    previousDayKey,
    shiftDateKey,
    sourceWindow,
} from '../src/t1.js';

test('T+1 dates use Asia/Shanghai natural-day boundaries', () => {
    const now = new Date('2026-08-06T00:30:00.000Z');
    assert.equal(dateKeyInShanghai(now), '2026-08-06');
    assert.equal(previousDayKey(now), '2026-08-05');
    assert.deepEqual(sourceWindow('2026-08-05'), {
        start: '2026-08-04T16:00:00.000Z',
        end: '2026-08-05T16:00:00.000Z',
    });
});

test('date shifting handles month boundaries and rejects impossible dates', () => {
    assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
    assert.throws(() => shiftDateKey('2026-02-30', 1), /Invalid date key/);
});

test('the next daily run stays anchored to Shanghai time', () => {
    assert.equal(
        nextRunAt(new Date('2026-08-06T00:30:00.000Z'), 9, 0).toISOString(),
        '2026-08-06T01:00:00.000Z',
    );
    assert.equal(
        nextRunAt(new Date('2026-08-06T02:00:00.000Z'), 9, 0).toISOString(),
        '2026-08-07T01:00:00.000Z',
    );
});
