export const SERVICE_TIMEZONE = 'Asia/Shanghai';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw new Error('Expected a valid date');
    }
    return value;
}

export function dateKeyInShanghai(value) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: SERVICE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(validDate(value));
}

export function manualTodayWindow(value) {
    const triggeredAt = validDate(value);
    const localDate = dateKeyInShanghai(triggeredAt);
    if (!DATE_KEY_PATTERN.test(localDate)) throw new Error('Could not resolve the Shanghai date');
    return {
        localDate,
        start: new Date(`${localDate}T00:00:00+08:00`).toISOString(),
        end: triggeredAt.toISOString(),
    };
}
