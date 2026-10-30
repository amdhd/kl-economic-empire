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
let queue = Promise.resolve();
if (auth) onAuthStateChanged(auth, user => {
  revisions.clear();
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
export async function uploadCloud(slot: SlotId, json: string) {
  deserialize(json);
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
  useCloud.setState({ status: `Saved to cloud · ${new Date().toLocaleTimeString()}` });
}
/** Only slots explicitly loaded or uploaded this session are synced. Never overwrite unseen remote progress. */
export function syncCloud(slot: SlotId, json: string) {
  if (!auth?.currentUser || !revisions.has(slot)) return;
  const uid = auth.currentUser.uid;
  queue = queue.then(async () => {
    if (auth?.currentUser?.uid !== uid || !revisions.has(slot)) return;
    useCloud.setState({ status: 'Syncing… local save is safe' });
    try { await uploadCloud(slot, json); }
    catch (error) { useCloud.setState({ status: `Cloud sync stopped: ${(error as Error).message}` }); }
  });
}
