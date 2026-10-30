import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getDatabase, ref, get, runTransaction } from 'firebase/database';
import { create } from 'zustand';
import { deserialize } from './save';
import type { SlotId } from './storage';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};
export const cloudConfigured = Object.values(config).every(Boolean);
const app = cloudConfigured ? initializeApp(config) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getDatabase(app) : null;
export const useCloud = create<{ email: string | null; status: string }> (() => ({ email: null, status: 'Local saves active' }));
const revisions = new Map<SlotId, number>();
/** Saves are 2–5 MB, so routine autosaves upload at most this often; pauses, tab hides and manual saves go now. */
export const CLOUD_MIN_INTERVAL_MS = 5 * 60 * 1000;
/** Newest unsent snapshot per slot: later saves replace earlier ones instead of queueing behind them. */
const pending = new Map<SlotId, string>();
const lastUpload = new Map<SlotId, number>();
const timers = new Map<SlotId, ReturnType<typeof setTimeout>>();
let inFlight: Promise<void> | null = null;
if (auth) onAuthStateChanged(auth, user => {
  revisions.clear();
  pending.clear();
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  useCloud.setState({ email: user?.email ?? null, status: user ? 'Choose a cloud save to load, or upload a local slot.' : 'Local saves active' });
});
export async function login(email: string, password: string) {
  if (!auth) throw new Error('Cloud saves are not configured.');
  await signInWithEmailAndPassword(auth, email, password);
}
export async function logout() { if (auth) await signOut(auth); }
export async function resetPassword(email: string) { if (!auth) throw new Error('Cloud saves are not configured.'); await sendPasswordResetEmail(auth, email); }
function location(slot: SlotId) {
  if (!db || !auth?.currentUser) throw new Error('Sign in first.');
  return ref(db, `users/${auth.currentUser.uid}/saves/${slot}`);
}
export async function downloadCloud(slot: SlotId): Promise<string> {
  const uid = auth?.currentUser?.uid;
  const snapshot = await get(location(slot));
  if (auth?.currentUser?.uid !== uid) throw new Error('Account changed; try again.');
  const value = snapshot.val();
  if (!value) throw new Error('No cloud save in this slot.');
  deserialize(value.json);
  revisions.set(slot, value.revision);
  return value.json;
}
/** `trusted` skips re-validating a snapshot this game just serialized (avoids a multi-MB parse on the main thread). */
export async function uploadCloud(slot: SlotId, json: string, trusted = false) {
  if (!trusted) deserialize(json);
  const target = location(slot);
  const expected = revisions.get(slot) ?? 0;
  const uid = auth?.currentUser?.uid;
  const result = await runTransaction(target, current => {
    if (auth?.currentUser?.uid !== uid || (current?.revision ?? 0) !== expected) return;
    return { json, revision: expected + 1, savedAt: Date.now() };
  }, { applyLocally: false });
  if (!result.committed) {
    revisions.delete(slot);
    throw new Error('Cloud save changed or already exists. Load it before continuing cloud sync. Local progress is safe.');
  }
  if (auth?.currentUser?.uid !== uid) return;
  revisions.set(slot, expected + 1);
  lastUpload.set(slot, Date.now());
  useCloud.setState({ status: `Saved to cloud · ${new Date().toLocaleTimeString()}` });
}
/** Upload the newest pending snapshot for a slot, one upload at a time. */
async function flushSlot(slot: SlotId, uid: string): Promise<void> {
  const prior = timers.get(slot);
  if (prior) clearTimeout(prior);
  timers.delete(slot);
  while (inFlight) await inFlight;
  const json = pending.get(slot);
  if (json === undefined || auth?.currentUser?.uid !== uid || !revisions.has(slot)) return;
  pending.delete(slot);
  useCloud.setState({ status: 'Syncing… local save is safe' });
  inFlight = (async () => {
    try {
      await uploadCloud(slot, json, true);
    } catch (error) {
      useCloud.setState({ status: `Cloud sync stopped: ${(error as Error).message}` });
    }
  })();
  await inFlight;
  inFlight = null;
}

/**
 * Only slots explicitly loaded or uploaded this session are synced. Never overwrite unseen remote progress.
 * Routine saves are coalesced and throttled to one upload per CLOUD_MIN_INTERVAL_MS per slot; `urgent` saves
 * (pause, tab hidden, manual slot, campaign end) upload now. Either way only the newest snapshot is sent.
 */
export function syncCloud(slot: SlotId, json: string, urgent = true): Promise<void> {
  if (!auth?.currentUser || !revisions.has(slot)) return Promise.resolve();
  const uid = auth.currentUser.uid;
  pending.set(slot, json);
  const wait = urgent ? 0 : Math.max(0, (lastUpload.get(slot) ?? 0) + CLOUD_MIN_INTERVAL_MS - Date.now());
  if (wait === 0) return flushSlot(slot, uid);
  if (!timers.has(slot)) {
    timers.set(slot, setTimeout(() => void flushSlot(slot, uid), wait));
    useCloud.setState({ status: `Cloud sync queued · next upload in ${Math.ceil(wait / 60000)} min · local save is safe` });
  }
  return Promise.resolve();
}

/** Send any queued snapshots now (e.g. when the tab is hidden). */
export function flushCloud(): void {
  const uid = auth?.currentUser?.uid;
  if (!uid) return;
  for (const slot of [...pending.keys()]) void flushSlot(slot, uid);
}
