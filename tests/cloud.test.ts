import { beforeEach, expect, test, vi } from 'vitest';
import { createGame } from '../src/engine/game';
import { serialize } from '../src/persistence/save';
const backend = vi.hoisted(() => ({ current: null as null | { json: string; revision: number }, user: { uid: 'owner', email: 'owner@example.com' } }));
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
    backend.current = next; return { committed: true };
  },
}));
beforeEach(() => {
  vi.resetModules(); backend.current = null;
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
