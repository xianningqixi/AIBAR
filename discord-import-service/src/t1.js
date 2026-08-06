export const SERVICE_TIMEZONE = 'Asia/Shanghai';

const SHANGHAI_OFFSET = '+08:00';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function datePartsInShanghai(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Invalid date');
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: SERVICE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function dateKeyInShanghai(date = new Date()) {
    const { year, month, day } = datePartsInShanghai(date);
    return `${year}-${month}-${day}`;
}

export function shiftDateKey(dateKey, days) {
    if (!DATE_KEY_PATTERN.test(dateKey) || !Number.isInteger(days)) throw new Error('Invalid date key');
    const [year, month, day] = dateKey.split('-').map(Number);
    const normalizedSource = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
    if (normalizedSource !== dateKey) throw new Error('Invalid date key');
    const date = new Date(Date.UTC(year, month - 1, day + days));
    const shifted = date.toISOString().slice(0, 10);
    return shifted;
}

export function previousDayKey(now = new Date()) {
    return shiftDateKey(dateKeyInShanghai(now), -1);
}

export function sourceWindow(sourceDate) {
    if (!DATE_KEY_PATTERN.test(sourceDate)) throw new Error('sourceDate must use YYYY-MM-DD');
    const endDate = shiftDateKey(sourceDate, 1);
    const start = new Date(`${sourceDate}T00:00:00${SHANGHAI_OFFSET}`);
    const end = new Date(`${endDate}T00:00:00${SHANGHAI_OFFSET}`);
    if (!Number.isFinite(start.getTime()) || end.getTime() - start.getTime() !== 24 * 60 * 60 * 1000) {
        throw new Error('Invalid sourceDate');
    }
    return { start: start.toISOString(), end: end.toISOString() };
}

export function nextRunAt(now = new Date(), hour = 9, minute = 0) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Invalid run hour');
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('Invalid run minute');
    const today = dateKeyInShanghai(now);
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    let candidate = new Date(`${today}T${time}${SHANGHAI_OFFSET}`);
    if (candidate.getTime() <= now.getTime()) {
        candidate = new Date(`${shiftDateKey(today, 1)}T${time}${SHANGHAI_OFFSET}`);
    }
    return candidate;
}

export function isAtOrAfterRunTime(now = new Date(), hour = 9, minute = 0) {
    const today = dateKeyInShanghai(now);
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    return now.getTime() >= new Date(`${today}T${time}${SHANGHAI_OFFSET}`).getTime();
}
