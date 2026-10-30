import { describe, expect, it } from 'vitest';
import { easter, isNyseHoliday, isOpen, nextOpen, sessionPhase } from '../src/engine/market-calendar';
import { klToEpochMin, nyOffsetMin } from '../src/engine/time';

const kl = (y: number, m: number, d: number, h: number, min = 0) => klToEpochMin(y, m, d, h, min);

describe('exchange calendars', () => {
  it('Bursa: 09:00–12:30 and 14:30–17:00 MYT on weekdays', () => {
    expect(isOpen('MY', kl(2027, 1, 4, 8, 59))).toBe(false); // Monday
    expect(isOpen('MY', kl(2027, 1, 4, 9))).toBe(true);
    expect(sessionPhase('MY', kl(2027, 1, 4, 13))).toBe('break');
    expect(isOpen('MY', kl(2027, 1, 4, 15))).toBe(true);
    expect(sessionPhase('MY', kl(2027, 1, 4, 17))).toBe('post');
    expect(isOpen('MY', kl(2027, 1, 9, 10))).toBe(false); // Saturday
    expect(isOpen('MY', kl(2027, 1, 1, 10))).toBe(false); // New Year holiday
  });

  it('US: New York DST rules (2nd Sun March – 1st Sun Nov)', () => {
    expect(nyOffsetMin(Date.UTC(2027, 0, 15) / 60000)).toBe(-300);
    expect(nyOffsetMin(Date.UTC(2027, 6, 15) / 60000)).toBe(-240);
    expect(nyOffsetMin(Date.UTC(2027, 2, 14, 6, 59) / 60000)).toBe(-300); // DST starts 14 Mar 2027 07:00 UTC
    expect(nyOffsetMin(Date.UTC(2027, 2, 14, 7) / 60000)).toBe(-240);
    expect(nyOffsetMin(Date.UTC(2027, 10, 7, 6) / 60000)).toBe(-300); // ends 7 Nov 2027 06:00 UTC
  });

  it('US session in KL time: 22:30–05:00 in winter, 21:30–04:00 in summer', () => {
    // Tue 12 Jan 2027 NY = Tue 22:30 KL
    expect(isOpen('US', kl(2027, 1, 12, 22, 0))).toBe(false);
    expect(isOpen('US', kl(2027, 1, 12, 22, 30))).toBe(true);
    expect(isOpen('US', kl(2027, 1, 13, 4, 59))).toBe(true);
    expect(isOpen('US', kl(2027, 1, 13, 5, 0))).toBe(false);
    // July: one hour earlier
    expect(isOpen('US', kl(2027, 7, 13, 21, 30))).toBe(true);
    expect(isOpen('US', kl(2027, 7, 14, 4, 0))).toBe(false);
    // Never open during KL business hours
    for (let h = 9; h < 18; h++) expect(isOpen('US', kl(2027, 3, 3, h))).toBe(false);
  });

  it('NYSE holidays incl. Good Friday, observed Juneteenth and Saturday New Year', () => {
    expect(easter(2027)).toEqual({ month: 3, day: 28 });
    expect(isNyseHoliday({ year: 2027, month: 3, day: 26 })).toBe(true); // Good Friday
    expect(isNyseHoliday({ year: 2027, month: 6, day: 18 })).toBe(true); // Juneteenth (Sat) observed Fri
    expect(isNyseHoliday({ year: 2027, month: 11, day: 25 })).toBe(true); // Thanksgiving
    expect(isNyseHoliday({ year: 2027, month: 12, day: 24 })).toBe(true); // Christmas (Sat) observed Fri
    expect(isNyseHoliday({ year: 2027, month: 12, day: 31 })).toBe(false); // 1 Jan 2028 is Sat: not observed
    expect(isNyseHoliday({ year: 2027, month: 7, day: 5 })).toBe(true); // 4 Jul (Sun) observed Mon
  });

  it('nextOpen finds the next session', () => {
    const fri = kl(2027, 1, 8, 18); // Friday evening KL
    expect(nextOpen('MY', fri)).toBe(kl(2027, 1, 11, 9)); // Monday 09:00
    expect(nextOpen('US', fri)).toBe(kl(2027, 1, 8, 22, 30)); // Friday NY open
  });
});
