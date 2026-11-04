import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { COOLDOWN_DAYS, groupPolls } from '../src/engine/reactions';
import { deserialize, serialize } from '../src/persistence/save';
import { withoutEvents } from './helpers';

const lever = (s: ReturnType<typeof createGame>, l: 'minimumWage' | 'workerFreeze', value: number) =>
  expect(applyCommand(s, { type: 'setLever', lever: l, value }, s.clock.hour * 60).ok).toBe(true);

describe('reactive news and public figures (D-146)', () => {
  it('a policy decision draws named, fictional reactions on the next Monday', () => withoutEvents(() => {
    const s = createGame(31);
    lever(s, 'minimumWage', 2200);
    runHeadless(s, 24 * 8);
    const story = s.news.find((n) => n.voice && n.title.startsWith('Minimum wage up to RM2,200'));
    expect(story).toBeDefined();
    expect(story!.body).toContain('(fictional)');
    const voices = s.reactions.quotes.filter((q) => q.topic === 'minimumWage:up').map((q) => q.voice);
    expect(voices).toEqual(expect.arrayContaining(['union', 'business']));
    // Reported once: the snapshot moves on, so the next Monday is quiet about it.
    runHeadless(s, 24 * 14);
    expect(s.news.filter((n) => n.title.startsWith('Minimum wage up to')).length).toBe(1);
  }));

  it('an overheated construction sector makes the news, at most once per cooldown', () => withoutEvents(() => {
    const s = createGame(21, 'balanced', 'malaysia', { months: 36, boom: true });
    s.sectors.prop.capacity *= 0.6;
    runHeadless(s, 24 * 150);
    const days = s.reactions.quotes.filter((q) => q.topic === 'overheat:prop').map((q) => q.day);
    const stories = [...new Set(days)];
    expect(stories.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < stories.length; i++) expect(stories[i] - stories[i - 1]).toBeGreaterThanOrEqual(COOLDOWN_DAYS.overheat);
    expect(s.news.some((n) => n.title.startsWith('Contractors fully booked'))).toBe(true);
  }));

  it('is display only: the economy and rng are identical with or without it', () => withoutEvents(() => {
    const a = createGame(41), b = createGame(41);
    delete (b as { reactions?: unknown }).reactions;
    for (const s of [a, b]) lever(s, 'minimumWage', 2400);
    runHeadless(a, 24 * 120); runHeadless(b, 24 * 120);
    expect(a.indicators).toEqual(b.indicators);
    expect(a.rng).toEqual(b.rng);
    expect(a.government).toEqual(b.government);
    expect(a.sectors).toEqual(b.sectors);
    expect(a.market).toEqual(b.market);
    expect(a.reactions.polls.length).toBe(a.reports.length);
  }));

  it('group polls move with the policies that touch each group', () => {
    const s = createGame(51);
    const before = groupPolls(s);
    for (const g of Object.values(before)) { expect(g.value).toBeGreaterThanOrEqual(0); expect(g.value).toBeLessThanOrEqual(100); }
    lever(s, 'minimumWage', 2600);
    s.government.policies.tax.corporate += 0.07;
    const after = groupPolls(s);
    expect(after.b40.value).toBeGreaterThan(before.b40.value);
    expect(after.business.value).toBeLessThan(before.business.value - 10);
    expect(after.business.drivers.map((d) => d.label)).toContain('Corporate tax');
  });

  it('is deterministic and survives save, load and migration from schema 20', () => withoutEvents(() => {
    const a = createGame(61), b = createGame(61);
    for (const s of [a, b]) { lever(s, 'workerFreeze', 1); runHeadless(s, 24 * 60); }
    expect(a.news.map((n) => n.title)).toEqual(b.news.map((n) => n.title));
    expect(deserialize(serialize(a)).reactions).toEqual(a.reactions);
    const file = JSON.parse(serialize(a));
    delete file.state.reactions;
    file.state.schemaVersion = 20; file.schemaVersion = 20;
    const t = deserialize(JSON.stringify(file));
    expect(t.reactions.quotes).toEqual([]);
    expect(t.reactions.opening.levers.workerFreeze).toBe(1);
  }));
});
