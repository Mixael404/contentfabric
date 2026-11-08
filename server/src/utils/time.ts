import { DateTime, IANAZone } from 'luxon';

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimezone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}

export function parseScheduleTimes(raw: string | string[]): string[] {
  const list = Array.isArray(raw) ? raw : raw.split(/[,\s;]+/);
  const times = list
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) throw new Error(`Некорректное время "${t}", ожидается HH:mm`);
      const hh = m[1].padStart(2, '0');
      const normalized = `${hh}:${m[2]}`;
      if (!TIME_RE.test(normalized)) throw new Error(`Некорректное время "${t}"`);
      return normalized;
    });
  return Array.from(new Set(times)).sort();
}

export interface Slot {
  /** ISO instant of the slot in UTC */
  at: DateTime;
  /** Stable key: YYYY-MM-DD|HH:mm in campaign timezone */
  key: string;
  time: string;
}

/**
 * Builds the schedule slots for the given day offsets (0 = today, -1 = yesterday)
 * in the campaign's timezone.
 */
export function slotsForDays(times: string[], tz: string, now: DateTime, dayOffsets: number[]): Slot[] {
  const local = now.setZone(tz);
  const slots: Slot[] = [];
  for (const offset of dayOffsets) {
    const day = local.plus({ days: offset }).startOf('day');
    for (const t of times) {
      const [h, m] = t.split(':').map(Number);
      const at = day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
      slots.push({ at: at.toUTC(), key: `${day.toISODate()}|${t}`, time: t });
    }
  }
  return slots.sort((a, b) => a.at.toMillis() - b.at.toMillis());
}

export function nextSlot(times: string[], tz: string, now = DateTime.utc()): DateTime | null {
  if (times.length === 0) return null;
  const slots = slotsForDays(times, tz, now, [0, 1]);
  const next = slots.find((s) => s.at > now);
  return next ? next.at : null;
}

export function formatInZone(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(tz).toFormat('dd.MM.yyyy HH:mm');
}

export function todayHuman(tz: string, locale = 'ru'): string {
  return DateTime.now().setZone(tz).setLocale(locale).toFormat('d MMMM yyyy, cccc');
}
