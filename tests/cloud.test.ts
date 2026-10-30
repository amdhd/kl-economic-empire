import { beforeEach, expect, test, vi } from 'vitest';
import { createGame } from '../src/engine/game';
import { serialize } from '../src/persistence/save';
const backend = vi.hoisted(() => ({ current: null as null | { json: string; revision: number }, user: { uid: 'owner', email: 'owner@example.com' }, writes: 0 }));
vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  getAuth: () => ({ currentUser: backend.user }),
  onAuthStateChanged: (_: unknown, cb: (u: unknown) => void) => cb(backend.user),
  signInWithEmailAndPassword: vi.fn(), signOut: vi.fn(), sendPasswordResetEmail: vi.fn(),
}));
vi.mock('firebase/database', () => ({
  getDatabase: () => ({}), ref: (_: unknown, path: string) => path,
  get: async () => ({ val: () => backend.current }),
  runTransaction: async (_: unknown, update: (v: unknown) => typeof backend.current | undefined) => {
    const next = update(backend.current);
    if (!next) return { committed: false };
    backend.current = next; backend.writes += 1; return { committed: true };
  },
}));
beforeEach(() => {
  vi.resetModules(); backend.current = null; backend.writes = 0; vi.useRealTimers();
  for (const key of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'DATABASE_URL']) vi.stubEnv(`VITE_FIREBASE_${key}`, 'test');
});
test('cloud writes reject unseen and concurrent saves; downloading permits revision-safe continuation', async () => {
  const cloud = await import('../src/persistence/cloud');
  const json = serialize(createGame(123, 'balanced'));
  await cloud.uploadCloud('autosave', json);
  expect(backend.current?.revision).toBe(1);
  backend.current = { json, revision: 2 };
  await expect(cloud.uploadCloud('autosave', json)).rejects.toThrow('Cloud save changed');
  expect(backend.current.revision).toBe(2);
  expect(await cloud.downloadCloud('autosave')).toBe(json);
  await cloud.uploadCloud('autosave', json);
  expect(backend.current.revision).toBe(3);
});
test('invalid cloud snapshots cannot be downloaded or uploaded', async () => {
  const cloud = await import('../src/persistence/cloud');
  backend.current = { json: '{}', revision: 1 };
  await expect(cloud.downloadCloud('slot1')).rejects.toThrow();
  await expect(cloud.uploadCloud('slot1', '{}')).rejects.toThrow();
  expect(backend.current.revision).toBe(1);
});

test('routine autosaves are coalesced and throttled; urgent saves upload now with only the newest snapshot', async () => {
  const cloud = await import('../src/persistence/cloud');
  const a = serialize(createGame(124, 'balanced'));
  const b = serialize(createGame(125, 'balanced'));
  const c = serialize(createGame(126, 'balanced'));
  await cloud.uploadCloud('autosave', a); // connects the slot
  expect(backend.writes).toBe(1);
  vi.useFakeTimers();
  // Right after an upload, routine saves wait for the interval and replace each other.
  await cloud.syncCloud('autosave', b, false);
  await cloud.syncCloud('autosave', c, false);
  expect(backend.writes).toBe(1);
  await vi.advanceTimersByTimeAsync(cloud.CLOUD_MIN_INTERVAL_MS + 10);
  expect(backend.writes).toBe(2);
  expect(backend.current?.json).toBe(c);
  expect(backend.current?.revision).toBe(2);
  // An urgent save (pause, tab hidden, manual save) goes immediately.
  await cloud.syncCloud('autosave', a, true);
  expect(backend.writes).toBe(3);
  expect(backend.current?.json).toBe(a);
  vi.useRealTimers();
});

test('slots never uploaded or loaded this session are not synced', async () => {
  const cloud = await import('../src/persistence/cloud');
  await cloud.syncCloud('slot2', serialize(createGame(127, 'balanced')), true);
  expect(backend.writes).toBe(0);
  expect(backend.current).toBeNull();
});
